import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { prisma } from '@/server/db'
import {
  buildOffiAdoption,
  buildOffiWrite,
  offiVenueIdFromUrl,
  parseDirectOnly,
  type ExistingWork,
} from '@/features/offi-import/merge'
import { titleSlug } from '@/features/offi-import/schemas'
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

    // Une fiche offi est unique par URL, une fiche directe par couple lieu + titre normalisé
    // (l'URL d'agenda est partagée par plusieurs spectacles).
    const key = record.direct_key ?? record.url
    if (seenUrls.has(key)) {
      skipped += 1
      continue
    }

    seenUrls.add(key)
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

export const WORK_SELECT = {
  id: true,
  title: true,
  sourceUrl: true,
  directKey: true,
  dataSource: true,
  category: true,
  description: true,
  imageUrl: true,
  durationMin: true,
  director: true,
  cast: true,
  address: true,
  arrondissement: true,
  officialUrl: true,
  venue: true,
} as const

/** Lieux sortis d'offi (`data/venues/direct_only.csv`). Fichier absent = aucun lieu. */
export function loadDirectOnlyVenues(file = process.env.VENUES_DIRECT_ONLY_FILE ?? path.resolve(process.cwd(), '..', 'data', 'venues', 'direct_only.csv')) {
  return fs.existsSync(file) ? parseDirectOnly(fs.readFileSync(file, 'utf-8')) : new Set<number>()
}

export async function ingestOffiFile(file: string) {
  if (!fs.existsSync(file)) {
    throw new Error(`Fichier introuvable: ${file}`)
  }

  const allRecords = await readOffiFile(file)
  const directOnly = loadDirectOnlyVenues()
  const records = allRecords.filter((record) => {
    const venueOffiId = offiVenueIdFromUrl(record.url)
    return venueOffiId == null || !directOnly.has(venueOffiId)
  })
  if (records.length < allRecords.length) {
    console.log(`[ingest:offi] ${allRecords.length - records.length} fiche(s) ignorée(s) : lieux de direct_only.csv`)
  }

  // Lignes portant déjà des données directes : l'offi ne touche pas à leurs champs prioritaires,
  // et adopte les fiches directes seules du même lieu et du même titre (aucun doublon).
  const withDirect = (await prisma.work.findMany({
    where: { dataSource: { in: ['direct', 'offi+direct'] } },
    select: WORK_SELECT,
  })) as ExistingWork[]
  const bySourceUrl = new Map(withDirect.map((work) => [work.sourceUrl, work]))
  const adoptable = new Map<string, ExistingWork>()
  for (const work of withDirect) {
    const venueOffiId = work.directKey ? /-(\d+):/.exec(work.directKey)?.[1] : null
    if (work.dataSource === 'direct' && venueOffiId) adoptable.set(`${venueOffiId}:${titleSlug(work.title)}`, work)
  }

  let imported = 0
  let adopted = 0

  for (let i = 0; i < records.length; i += INGEST_CONCURRENCY) {
    const chunk = records.slice(i, i + INGEST_CONCURRENCY)
    await Promise.all(
      chunk.map((record) => {
        const existing = bySourceUrl.get(record.url) ?? null
        if (!existing) {
          const venueOffiId = offiVenueIdFromUrl(record.url)
          const key = venueOffiId == null ? null : `${venueOffiId}:${titleSlug(record.title)}`
          const direct = key ? adoptable.get(key) : undefined
          if (key && direct) {
            adoptable.delete(key)
            adopted += 1
            return prisma.work.update({ where: { id: direct.id }, data: buildOffiAdoption(record) })
          }
        }
        const { create, update } = buildOffiWrite(record, existing)
        return prisma.work.upsert({ where: { sourceUrl: record.url }, update, create })
      }),
    )
    imported += chunk.length
  }

  await prisma.importJob.create({ data: { source: file, imported } })
  if (adopted > 0) console.log(`[ingest:offi] ${adopted} fiche(s) offi fusionnée(s) avec une fiche directe`)

  // Le cycle de vie de la connexion appartient à l'appelant (script), pas à cette
  // fonction métier : pas de prisma.$disconnect() sur le singleton partagé ici.
  return { imported, validated: records.length }
}
