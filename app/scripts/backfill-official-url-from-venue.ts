// Backfill Work.officialUrl en DÉCOUVRANT la page dédiée sur le site du lieu.
//
// Offi n'expose pas de lien profond pour le théâtre (et certains autres). Mais le
// site du lieu liste ses spectacles courants. On inspecte la home du lieu, on
// matche chaque titre de façon conservatrice (scraper/discover.py) et — seulement si
// l'URL répond en 200 — on l'enregistre. Mieux vaut aucun lien qu'un mauvais.
//
// Re-runnable : ne traite que les œuvres venue-based sans officialUrl dont le lieu a
// un site. Couverture partielle attendue (spectacles non listés sur la home, sites
// qui bloquent/SSL invalide).
//
// Usage : pnpm exec tsx --env-file=.env --env-file=.env.local \
//   scripts/backfill-official-url-from-venue.ts [sections] [maxVenues]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { prisma } from '@/server/db'

const here = path.dirname(fileURLToPath(import.meta.url))
const scraperDir = path.resolve(here, '../../scraper')
const PY = path.join(scraperDir, '.venv/bin/python')
const CLI = path.join(scraperDir, 'discover.py')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const DEFAULT_SECTIONS = ['theatre', 'exposition', 'concert', 'visite', 'enfants']
const sections = (process.argv[2] ? process.argv[2].split(',') : DEFAULT_SECTIONS).map((s) => s.trim()).filter(Boolean)
const maxVenues = Number(process.argv[3] ?? 1000)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    return { html: await res.text(), finalUrl: res.url || url }
  } catch {
    return null // 403, SSL invalide, DNS… → on saute ce lieu
  }
}

// Vérifie qu'une URL découverte répond (évite d'enregistrer un lien mort).
async function isLive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(12_000) })
    return res.ok
  } catch {
    return false
  }
}

function matchTitles(baseUrl: string, html: string, titles: string[]): Record<string, string> {
  const res = spawnSync(PY, [CLI, baseUrl], {
    input: JSON.stringify({ html, titles }),
    encoding: 'utf-8',
    cwd: scraperDir,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 20_000,
    killSignal: 'SIGKILL',
  })
  if (res.status !== 0 || !res.stdout) return {}
  try {
    return JSON.parse(res.stdout)?.matches ?? {}
  } catch {
    return {}
  }
}

async function main() {
  // Œuvres sans officialUrl, dont le lieu a un site, groupées par lieu.
  const works = await prisma.work.findMany({
    where: { officialUrl: null, section: { in: sections }, venue_ref: { website: { not: null } } },
    select: { id: true, title: true, venueId: true, venue_ref: { select: { website: true } } },
  })

  const byVenue = new Map<string, { website: string; items: { id: string; title: string }[] }>()
  for (const w of works) {
    const website = w.venue_ref?.website
    if (!w.venueId || !website) continue
    const g = byVenue.get(w.venueId) ?? { website, items: [] }
    g.items.push({ id: w.id, title: w.title })
    byVenue.set(w.venueId, g)
  }

  const venues = [...byVenue.entries()].slice(0, maxVenues)
  let venuesFetched = 0
  let matched = 0
  let live = 0

  for (const [, group] of venues) {
    const page = await fetchPage(group.website)
    if (!page) continue
    venuesFetched += 1

    const titles = group.items.map((i) => i.title)
    const matches = matchTitles(page.finalUrl, page.html, titles)

    for (const item of group.items) {
      const url = matches[item.title]
      if (!url) continue
      matched += 1
      if (!(await isLive(url))) continue
      live += 1
      await prisma.work.update({ where: { id: item.id }, data: { officialUrl: url } })
    }
    await sleep(400) // throttle poli
  }

  console.log(
    JSON.stringify({ sections, venuesCandidates: byVenue.size, venuesFetched, matched, written: live }),
  )
}

main()
  .catch((error) => {
    console.error('[backfill-official-url-from-venue]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
