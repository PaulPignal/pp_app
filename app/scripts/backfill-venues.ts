// Backfill / ingestion des lieux (Venue) depuis offi, + lien Work.venueId (théâtre).
//
// - Théâtre : l'URL de la page lieu se déduit de l'URL du spectacle
//   (/theatre/<venue>-<id>/<show>.html → /theatre/<venue>-<id>.html). On upsert le
//   lieu et on relie tous les spectacles de ce lieu (venueId).
// - Cinéma : un film joue dans plusieurs salles → pas de lien 1:1. On récolte les
//   salles listées sur les fiches films (catalogue uniquement).
//
// Usage : pnpm exec tsx --env-file=.env --env-file=.env.local scripts/backfill-venues.ts [theatre|cinema|all] [limit]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { prisma } from '@/server/db'

const here = path.dirname(fileURLToPath(import.meta.url))
const scraperDir = path.resolve(here, '../../scraper')
const PY = path.join(scraperDir, '.venv/bin/python')
const CLI = path.join(scraperDir, 'extract_venue_cli.py')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const mode = (process.argv[2] ?? 'all') as 'theatre' | 'cinema' | 'all'
const limit = Number(process.argv[3] ?? 1000)

type VenueData = {
  offi_id: number
  kind: string
  name: string
  street_address: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  metro: string | null
  access: string | null
  image: string | null
  source_url: string
}

function theatreVenueUrlFromShow(url: string): string | null {
  const m = url.match(/^(https?:\/\/[^/]+\/theatre\/[^/]+-\d+)\/[^/]+-\d+(?:\.html)?$/)
  return m ? `${m[1]}.html` : null
}

function cinemaVenueLinks(html: string): string[] {
  const out = new Set<string>()
  const re = /\/cinema\/(?!evenement\/)[a-z0-9-]+-\d+\.html/g
  for (const m of html.matchAll(re)) out.add(`https://www.offi.fr${m[0]}`)
  return [...out]
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

function extractVenue(html: string, url: string, kind: string): VenueData | null {
  const res = spawnSync(PY, [CLI, url, kind], {
    input: html,
    encoding: 'utf-8',
    cwd: scraperDir,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 10_000,
    killSignal: 'SIGKILL',
  })
  if (res.status !== 0 || !res.stdout) return null
  try {
    const parsed = JSON.parse(res.stdout)
    return parsed && parsed.offi_id ? parsed : null
  } catch {
    return null
  }
}

async function upsertVenue(v: VenueData): Promise<string> {
  const data = {
    offiId: v.offi_id,
    kind: v.kind,
    name: v.name,
    streetAddress: v.street_address,
    postalCode: v.postal_code,
    city: v.city,
    country: v.country,
    latitude: v.latitude,
    longitude: v.longitude,
    phone: v.phone,
    metro: v.metro,
    access: v.access,
    imageUrl: v.image,
    sourceUrl: v.source_url,
  }
  const venue = await prisma.venue.upsert({ where: { offiId: v.offi_id }, create: data, update: data })
  return venue.id
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function backfillTheatre() {
  const works = await prisma.work.findMany({
    where: { section: 'theatre' },
    select: { id: true, sourceUrl: true },
  })
  // Regroupe les spectacles par URL de lieu déduite.
  const byVenueUrl = new Map<string, string[]>()
  for (const w of works) {
    const venueUrl = theatreVenueUrlFromShow(w.sourceUrl)
    if (!venueUrl) continue
    const list = byVenueUrl.get(venueUrl) ?? []
    list.push(w.id)
    byVenueUrl.set(venueUrl, list)
  }

  // Ne (re)traite que les lieux pas encore en base, dans la limite demandée.
  const existing = new Set((await prisma.venue.findMany({ where: { kind: 'theatre' }, select: { sourceUrl: true } })).map((v) => v.sourceUrl))
  const urls = [...byVenueUrl.keys()].filter((u) => !existing.has(u)).slice(0, limit)

  let venues = 0
  let linked = 0
  for (const url of urls) {
    const html = await fetchHtml(url)
    if (!html) continue
    const v = extractVenue(html, url, 'theatre')
    if (!v) continue
    const venueId = await upsertVenue(v)
    venues += 1
    const workIds = byVenueUrl.get(url) ?? []
    const res = await prisma.work.updateMany({ where: { id: { in: workIds } }, data: { venueId } })
    linked += res.count
    await sleep(350)
  }
  console.log(JSON.stringify({ segment: 'theatre', venues, linkedWorks: linked, candidates: urls.length }))
}

async function backfillCinema() {
  // Récolte les URLs de salles depuis les fiches films récentes.
  const films = await prisma.work.findMany({
    where: { section: 'cinema' },
    select: { sourceUrl: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  const venueUrls = new Set<string>()
  for (const f of films) {
    const html = await fetchHtml(f.sourceUrl)
    if (html) cinemaVenueLinks(html).forEach((u) => venueUrls.add(u))
    await sleep(250)
    if (venueUrls.size >= limit) break
  }

  const existing = new Set((await prisma.venue.findMany({ where: { kind: 'cinema' }, select: { sourceUrl: true } })).map((v) => v.sourceUrl))
  const urls = [...venueUrls].filter((u) => !existing.has(u)).slice(0, limit)

  let venues = 0
  for (const url of urls) {
    const html = await fetchHtml(url)
    if (!html) continue
    const v = extractVenue(html, url, 'cinema')
    if (!v) continue
    await upsertVenue(v)
    venues += 1
    await sleep(350)
  }
  console.log(JSON.stringify({ segment: 'cinema', venues, harvested: venueUrls.size }))
}

async function main() {
  if (mode === 'theatre' || mode === 'all') await backfillTheatre()
  if (mode === 'cinema' || mode === 'all') await backfillCinema()
}

main()
  .catch((error) => {
    console.error('[backfill-venues]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
