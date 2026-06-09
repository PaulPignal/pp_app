// Backfill / ingestion des lieux (Venue) depuis offi, + lien Work.venueId.
//
// - Sections « lieu » (théâtre, expo, concert, visite, enfants) : un spectacle = un
//   lieu, l'URL de la page lieu se déduit de l'URL du spectacle
//   (/<seg>/<lieu>-<id>/<show>.html → /<seg>/<lieu>-<id>.html). On upsert le lieu
//   (avec son site officiel) et on relie tous les spectacles de ce lieu (venueId).
// - Cinéma : un film joue dans plusieurs salles → pas de lien 1:1. On récolte les
//   salles listées sur les fiches films (catalogue uniquement).
//
// Usage : pnpm exec tsx --env-file=.env --env-file=.env.local scripts/backfill-venues.ts \
//   [theatre|exposition|concert|visite|enfants|cinema|venues|all] [limit]
//   venues = toutes les sections « lieu » ; all = venues + cinema.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { prisma } from '@/server/db'

const here = path.dirname(fileURLToPath(import.meta.url))
const scraperDir = path.resolve(here, '../../scraper')
const PY = path.join(scraperDir, '.venv/bin/python')
const CLI = path.join(scraperDir, 'extract_venue_cli.py')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const mode = process.argv[2] ?? 'all'
const limit = Number(process.argv[3] ?? 1000)

// Sections « lieu » → segment d'URL offi correspondant.
const VENUE_SECTIONS: Record<string, string> = {
  theatre: 'theatre',
  exposition: 'expositions-musees',
  concert: 'concerts',
  visite: 'visites-conferences',
  enfants: 'enfants',
}

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
  website: string | null
  source_url: string
}

function venueUrlFromShow(url: string, seg: string): string | null {
  const m = url.match(new RegExp(`^(https?://[^/]+/${seg}/[^/]+-\\d+)/[^/]+-\\d+(?:\\.html)?$`))
  return m ? `${m[1]}.html` : null
}

function offiIdFromUrl(url: string | null): number | null {
  if (!url) return null
  const m = url.match(/-(\d+)(?:\.html)?(?:[?#].*)?$/)
  return m ? Number(m[1]) : null
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
    website: v.website,
    sourceUrl: v.source_url,
  }
  const venue = await prisma.venue.upsert({ where: { offiId: v.offi_id }, create: data, update: data })
  return venue.id
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function backfillVenueSection(section: string) {
  const seg = VENUE_SECTIONS[section]
  const works = await prisma.work.findMany({
    where: { section },
    select: { id: true, sourceUrl: true },
  })
  // Regroupe les spectacles par URL de lieu déduite.
  const byVenueUrl = new Map<string, string[]>()
  for (const w of works) {
    const venueUrl = venueUrlFromShow(w.sourceUrl, seg)
    if (!venueUrl) continue
    const list = byVenueUrl.get(venueUrl) ?? []
    list.push(w.id)
    byVenueUrl.set(venueUrl, list)
  }

  // Ne (re)traite que les lieux pas encore en base, dans la limite demandée.
  const existing = new Set((await prisma.venue.findMany({ where: { kind: section }, select: { sourceUrl: true } })).map((v) => v.sourceUrl))
  const urls = [...byVenueUrl.keys()].filter((u) => !existing.has(u)).slice(0, limit)

  let venues = 0
  let linked = 0
  for (const url of urls) {
    const html = await fetchHtml(url)
    if (!html) continue
    const v = extractVenue(html, url, section)
    if (!v) continue
    const venueId = await upsertVenue(v)
    venues += 1
    const workIds = byVenueUrl.get(url) ?? []
    const res = await prisma.work.updateMany({ where: { id: { in: workIds } }, data: { venueId } })
    linked += res.count
    await sleep(350)
  }

  // Relink (sans fetch) : spectacles encore non liés dont le lieu est déjà en base.
  // Couvre les nouveaux spectacles ajoutés dans un lieu déjà connu.
  const knownVenues = await prisma.venue.findMany({ where: { kind: section }, select: { id: true, offiId: true } })
  const venueIdByOffiId = new Map(knownVenues.map((v) => [v.offiId, v.id]))
  const unlinked = await prisma.work.findMany({
    where: { section, venueId: null },
    select: { id: true, sourceUrl: true },
  })
  const relinkGroups = new Map<string, string[]>()
  for (const w of unlinked) {
    const offiId = offiIdFromUrl(venueUrlFromShow(w.sourceUrl, seg))
    const vid = offiId != null ? venueIdByOffiId.get(offiId) : undefined
    if (!vid) continue
    const list = relinkGroups.get(vid) ?? []
    list.push(w.id)
    relinkGroups.set(vid, list)
  }
  let relinked = 0
  for (const [vid, ids] of relinkGroups) {
    const res = await prisma.work.updateMany({ where: { id: { in: ids } }, data: { venueId: vid } })
    relinked += res.count
  }

  console.log(JSON.stringify({ segment: section, venues, linkedWorks: linked, relinked, candidates: urls.length }))
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
  const venueSections = Object.keys(VENUE_SECTIONS)
  if (mode === 'all' || mode === 'venues') {
    for (const section of venueSections) await backfillVenueSection(section)
  } else if (venueSections.includes(mode)) {
    await backfillVenueSection(mode)
  }
  if (mode === 'cinema' || mode === 'all') await backfillCinema()
}

main()
  .catch((error) => {
    console.error('[backfill-venues]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
