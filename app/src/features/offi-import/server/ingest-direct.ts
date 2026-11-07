import fs from 'node:fs'
import { prisma } from '@/server/db'
import { buildDirectWrite, findForDirect, offiIdFromVenueSlug, type ExistingWork } from '@/features/offi-import/merge'
import { OFFI_URL_PREFIX, type OffiWorkRecord } from '@/features/offi-import/schemas'
import { readOffiFile, WORK_SELECT } from '@/features/offi-import/server/ingest'

const VENUE_CONCURRENCY = 8

async function runPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await worker(items[next++])
    }),
  )
}

/** Ingestion des enregistrements `source: direct`. Même JSONL que celui du scraper
 *  `python3 -m scraper.venues`. Les lignes `source` absente ou `offi` sont ignorées ici. */
export async function ingestDirectFile(file: string) {
  if (!fs.existsSync(file)) throw new Error(`Fichier introuvable: ${file}`)
  const records = (await readOffiFile(file)).filter((record) => record.source === 'direct')
  if (records.length === 0) throw new Error(`No direct records found in ${file}`)

  const venues = await prisma.venue.findMany({ select: { id: true, offiId: true } })
  const venueByOffiId = new Map(venues.map((venue) => [venue.offiId, venue.id]))

  const bySlug = new Map<string, OffiWorkRecord[]>()
  for (const record of records) {
    const slug = record.venue_slug as string
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), record])
  }

  const counts = { created: 0, merged: 0, updated: 0 }
  await runPool([...bySlug.entries()], VENUE_CONCURRENCY, async ([slug, group]) => {
    const offiId = offiIdFromVenueSlug(slug)
    const venueId = offiId == null ? null : (venueByOffiId.get(offiId) ?? null)
    // Fiches du lieu : liées au lieu, ou dont l'URL offi porte son identifiant (le lien Venue
    // n'est posé qu'au relink du dimanche).
    const venueWorks = (await prisma.work.findMany({
      where: {
        OR: [
          ...(venueId ? [{ venueId }] : []),
          ...(offiId == null ? [] : [{ sourceUrl: { startsWith: OFFI_URL_PREFIX, contains: `-${offiId}/` } }]),
        ],
      },
      select: WORK_SELECT,
    })) as ExistingWork[]
    const directRows = (await prisma.work.findMany({
      where: { directKey: { startsWith: `${slug}:` } },
      select: WORK_SELECT,
    })) as ExistingWork[]
    const byDirectKey = new Map(directRows.map((work) => [work.directKey as string, work]))

    for (const record of group) {
      const existing = findForDirect(record, byDirectKey, venueWorks)
      const write = buildDirectWrite(record, existing, venueId)
      if (write.kind === 'create') {
        await prisma.work.upsert({ where: { sourceUrl: write.create.sourceUrl }, create: write.create, update: {} })
        counts.created += 1
      } else {
        await prisma.work.update({ where: { id: write.id }, data: write.update })
        if (existing?.dataSource === 'direct') counts.updated += 1
        else counts.merged += 1
      }
    }
  })

  await prisma.importJob.create({ data: { source: file, imported: records.length } })
  return { imported: records.length, venues: bySlug.size, ...counts }
}
