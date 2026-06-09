// Remplit Venue.website (site officiel) sur les lieux déjà en base qui ne l'ont pas
// encore. Re-scrape léger de la page lieu offi → lien rel="external" (parsers.extract_venue).
// Re-runnable : ne traite que les lieux où website est null.
//
// Usage : pnpm exec tsx --env-file=.env --env-file=.env.local scripts/backfill-venue-websites.ts [limit]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { prisma } from '@/server/db'

const here = path.dirname(fileURLToPath(import.meta.url))
const scraperDir = path.resolve(here, '../../scraper')
const PY = path.join(scraperDir, '.venv/bin/python')
const CLI = path.join(scraperDir, 'extract_venue_cli.py')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const limit = Number(process.argv[2] ?? 1000)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

function extractWebsite(html: string, url: string, kind: string): string | null {
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
    return parsed?.website ?? null
  } catch {
    return null
  }
}

async function main() {
  const venues = await prisma.venue.findMany({
    where: { website: null },
    select: { id: true, kind: true, sourceUrl: true },
    take: limit,
  })
  let updated = 0
  let missing = 0
  for (const v of venues) {
    const html = await fetchHtml(v.sourceUrl)
    if (!html) {
      missing += 1
      continue
    }
    const website = extractWebsite(html, v.sourceUrl, v.kind)
    if (website) {
      await prisma.venue.update({ where: { id: v.id }, data: { website } })
      updated += 1
    } else {
      missing += 1
    }
    await sleep(300)
  }
  console.log(JSON.stringify({ scanned: venues.length, updated, missing }))
}

main()
  .catch((error) => {
    console.error('[backfill-venue-websites]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
