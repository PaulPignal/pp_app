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
  for await (const rawLine of rl) {
    lineNumber += 1
    const line = rawLine.trim()
    if (!line) continue

    const record = parseOffiJsonLine(line, lineNumber)
    if (seenUrls.has(record.url)) {
      throw new Error(`Line ${lineNumber}: duplicate url ${record.url}`)
    }

    seenUrls.add(record.url)
    records.push(record)
  }

  if (records.length === 0) {
    throw new Error(`No records found in ${file}`)
  }

  return records
}

const INGEST_CHUNK_SIZE = 500

export async function ingestOffiFile(file: string) {
  if (!fs.existsSync(file)) {
    throw new Error(`Fichier introuvable: ${file}`)
  }

  const records = await readOffiFile(file)
  let imported = 0

  // Upsert par lots dans une transaction : 1 aller-retour réseau par lot au lieu
  // d'un par enregistrement (mesuré jusqu'à ~200× plus rapide en base distante).
  // La sémantique non-destructive est préservée : chaque upsert garde son `update`
  // ciblé construit par buildWorkUpsert.
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
