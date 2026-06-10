// Apprend, pour chaque site de lieu, le MOTIF d'URL des pages événement, puis
// CONSTRUIT l'URL de chaque spectacle du lieu (même non listé en home) → on devient
// indépendant d'Offi pour le lien par événement.
//
// Pour chaque lieu (avec site) :
//   1. fetch la home (+ une page agenda/programme si trouvée),
//   2. matche quelques titres → URLs (scraper/discover.match_titles),
//   3. en déduit le gabarit (ex. https://x.com/spectacle/{slug}/) — slug-only,
//   4. pour chaque spectacle sans officialUrl : URL matchée, sinon URL construite
//      via le gabarit ; on ne la garde QUE si elle répond en 200 ET ne redirige pas
//      vers l'accueil (anti soft-404),
//   5. stocke le gabarit sur Venue.eventUrlTemplate.
//
// Re-runnable. Usage : pnpm exec tsx --env-file=.env --env-file=.env.local \
//   scripts/backfill-venue-event-urls.ts [maxVenues]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { prisma } from '@/server/db'

const here = path.dirname(fileURLToPath(import.meta.url))
const scraperDir = path.resolve(here, '../../scraper')
const PY = path.join(scraperDir, '.venv/bin/python')
const CLI = path.join(scraperDir, 'discover.py')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const VENUE_SECTIONS = ['theatre', 'exposition', 'concert', 'visite', 'enfants']
const maxVenues = Number(process.argv[2] ?? 5000)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const slugify = (s: string) =>
  (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const AGENDA_RE = /\/(agenda|programme|programmation|saison|spectacles?|evenements?|billetterie|a-l-affiche)\b/i

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    return { html: await res.text(), finalUrl: res.url || url }
  } catch {
    return null
  }
}

// Vérifie qu'une URL construite est valable : 200 + pas de redirection vers
// l'accueil (beaucoup de sites renvoient la home en « soft 404 »).
async function isRealPage(url: string, homeUrls: Set<string>): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(12_000) })
    if (!res.ok) return false
    const landed = (res.url || url).replace(/\/+$/, '')
    if (homeUrls.has(landed)) return false
    return true
  } catch {
    return false
  }
}

function discover(baseUrl: string, html: string, titles: string[]): { matches: Record<string, string>; template: string | null; templateSupport: number } {
  const res = spawnSync(PY, [CLI, baseUrl], {
    input: JSON.stringify({ html, titles }),
    encoding: 'utf-8',
    cwd: scraperDir,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 20_000,
    killSignal: 'SIGKILL',
  })
  if (res.status !== 0 || !res.stdout) return { matches: {}, template: null, templateSupport: 0 }
  try {
    const p = JSON.parse(res.stdout)
    return { matches: p.matches ?? {}, template: p.template ?? null, templateSupport: p.templateSupport ?? 0 }
  } catch {
    return { matches: {}, template: null, templateSupport: 0 }
  }
}

async function main() {
  const works = await prisma.work.findMany({
    where: { section: { in: VENUE_SECTIONS }, venue_ref: { website: { not: null } } },
    select: { id: true, title: true, officialUrl: true, venueId: true, venue_ref: { select: { id: true, website: true } } },
  })

  // Regroupe par lieu.
  const byVenue = new Map<string, { website: string; items: { id: string; title: string; officialUrl: string | null }[] }>()
  for (const w of works) {
    const website = w.venue_ref?.website
    if (!w.venueId || !website) continue
    const g = byVenue.get(w.venueId) ?? { website, items: [] }
    g.items.push({ id: w.id, title: w.title, officialUrl: w.officialUrl })
    byVenue.set(w.venueId, g)
  }

  const venues = [...byVenue.entries()].slice(0, maxVenues)
  let venuesFetched = 0
  let templatesLearned = 0
  let urlsSet = 0
  const verifyCache = new Map<string, boolean>()

  for (const [venueId, group] of venues) {
    const home = await fetchPage(group.website)
    if (!home) continue
    venuesFetched += 1

    // Page agenda/programme éventuelle (1 seule) pour plus de titres matchés.
    let html = home.html
    const agendaHref = [...home.html.matchAll(/href=["']([^"']+)["']/gi)]
      .map((m) => m[1])
      .find((h) => AGENDA_RE.test(h))
    if (agendaHref) {
      const agendaUrl = agendaHref.startsWith('http') ? agendaHref : new URL(agendaHref, home.finalUrl).toString()
      const ag = await fetchPage(agendaUrl)
      if (ag) html += '\n' + ag.html
    }

    const titles = group.items.map((i) => i.title)
    const { matches, template, templateSupport } = discover(home.finalUrl, html, titles)

    if (template) {
      await prisma.venue.update({ where: { id: venueId }, data: { eventUrlTemplate: template } })
      templatesLearned += 1
    }

    const homeUrls = new Set([home.finalUrl.replace(/\/+$/, ''), group.website.replace(/\/+$/, '')])

    for (const item of group.items) {
      if (item.officialUrl) continue // ne pas écraser un lien dédié déjà connu (ex. rel=external Offi)
      const matched = matches[item.title]
      const constructed = template ? template.replace('{slug}', slugify(item.title)) : null
      const url = matched ?? (templateSupport >= 1 ? constructed : null)
      if (!url) continue

      let ok = verifyCache.get(url)
      if (ok === undefined) {
        ok = await isRealPage(url, homeUrls)
        verifyCache.set(url, ok)
      }
      if (!ok) continue
      await prisma.work.update({ where: { id: item.id }, data: { officialUrl: url } })
      urlsSet += 1
    }
    await sleep(350)
  }

  console.log(JSON.stringify({ venuesCandidates: byVenue.size, venuesFetched, templatesLearned, urlsSet }))
}

main()
  .catch((error) => {
    console.error('[backfill-venue-event-urls]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
