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

// Concurrence par lot (PAS de transaction) : la forme batch de $transaction a un
// timeout fixe de 5 s non configurable, qu'un lot dépasse dès que la latence Neon
// est élevée (~125 ms/upsert observé → 50 upserts ≈ 6 s → échec). En lançant ~25
// upserts en parallèle sans transaction, on garde la vitesse (concurrence) SANS
// aucun cap de durée. Les upserts sont idempotents → la sémantique non-destructive
// est préservée et une reprise éventuelle se réapplique sans dégât.
const INGEST_CONCURRENCY = 25

export async function ingestOffiFile(file: string) {
  if (!fs.existsSync(file)) {
    throw new Error(`Fichier introuvable: ${file}`)
  }

  const records = await readOffiFile(file)
  let imported = 0

  for (let i = 0; i < records.length; i += INGEST_CONCURRENCY) {
    const chunk = records.slice(i, i + INGEST_CONCURRENCY)
    await Promise.all(
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
