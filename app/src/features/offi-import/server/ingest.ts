import fs from 'node:fs'
import readline from 'node:readline'
import { prisma } from '@/server/db'
import { buildWorkUpsert } from '@/features/offi-import/mappers'
import { parseOffiJsonLine, type OffiWorkRecord } from '@/features/offi-import/schemas'

export async function readOffiFile(file: string) {
  const records: OffiWorkRecord[] = []
  const seenUrls = new Set<string>()
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  let lineNumber = 0
  let skipped = 0
  for await (const rawLine of rl) {
    lineNumber += 1
    const line = rawLine.trim()
    if (!line) continue

    // Tolérant : une ligne invalide (ou en doublon) est ignorée et journalisée,
    // sans interrompre l'ingestion entière (un job nocturne ne doit pas mourir
    // pour un enregistrement aberrant parmi des milliers).
    let record: OffiWorkRecord
    try {
      record = parseOffiJsonLine(line, lineNumber)
    } catch (error) {
      skipped += 1
      console.warn(`[ingest:offi] ${error instanceof Error ? error.message : `Line ${lineNumber}: invalid`} — ignorée`)
      continue
    }

    if (seenUrls.has(record.url)) {
      skipped += 1
      continue
    }

    seenUrls.add(record.url)
    records.push(record)
  }

  if (records.length === 0) {
    throw new Error(`No records found in ${file}`)
  }

  if (skipped > 0) {
    console.warn(`[ingest:offi] ${skipped} ligne(s) ignorée(s) sur ${lineNumber}`)
  }

  return records
}

// Lots volontairement petits : une transaction trop grosse dépasse le timeout
// Prisma (5 s) sur Neon distant (un lot de 500 prenait ~6 s → échec). ~50 upserts
// par transaction (~0,6 s) garde une large marge, même en cas de latence.
const INGEST_CHUNK_SIZE = 50

export async function ingestOffiFile(file: string) {
  if (!fs.existsSync(file)) {
    throw new Error(`Fichier introuvable: ${file}`)
  }

  const records = await readOffiFile(file)
  let imported = 0

  // Upsert par lots dans une transaction : 1 aller-retour réseau par lot au lieu
  // d'un par enregistrement (mesuré jusqu'à ~200× plus rapide en base distante).
  // La sémantique non-destructive est préservée : chaque upsert garde son `update`
  // ciblé construit par buildWorkUpsert. Timeout relevé pour absorber la latence.
  for (let i = 0; i < records.length; i += INGEST_CHUNK_SIZE) {
    const chunk = records.slice(i, i + INGEST_CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map((record) => {
        const { create, update } = buildWorkUpsert(record)
        return prisma.work.upsert({ where: { sourceUrl: record.url }, update, create })
      }),
    )
    imported += chunk.length
  }

  await prisma.importJob.create({ data: { source: file, imported } })

  // Le cycle de vie de la connexion appartient à l'appelant (script), pas à cette
  // fonction métier : pas de prisma.$disconnect() sur le singleton partagé ici.
  return { imported, validated: records.length }
}
