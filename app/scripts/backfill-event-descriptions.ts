// Récupère la description de la page événement du site du lieu (officialUrl) et la
// stocke dans Work.venueDescription — SOURCE À PART (on ne touche pas à Work.description
// d'Offi). Le choix d'affichage (Offi vs lieu) sera géré côté app ensuite.
//
// On extrait via scraper/extract_credits_cli.py (parseur : itemprop=description →
// synopsis → meta). Garde-fou léger : on ignore les bribes trop courtes (dates,
// slogans) sous ~60 caractères.
//
// Re-runnable : ne traite que les œuvres sans venueDescription. Usage :
//   pnpm exec tsx --env-file=.env --env-file=.env.local scripts/backfill-event-descriptions.ts [limit]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { prisma } from '@/server/db'

const here = path.dirname(fileURLToPath(import.meta.url))
const scraperDir = path.resolve(here, '../../scraper')
const PY = path.join(scraperDir, '.venv/bin/python')
const CLI = path.join(scraperDir, 'extract_credits_cli.py')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const MIN_LEN = 60 // en dessous : souvent une date/un slogan, pas un vrai synopsis
const limit = Number(process.argv[2] ?? 10000)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function extractDescription(html: string): string | null {
  const res = spawnSync(PY, [CLI], { input: html, encoding: 'utf-8', cwd: scraperDir, maxBuffer: 20 * 1024 * 1024, timeout: 10_000, killSignal: 'SIGKILL' })
  if (res.status !== 0 || !res.stdout) return null
  try {
    const d = JSON.parse(res.stdout)?.description
    return typeof d === 'string' ? d.replace(/\s+/g, ' ').trim() : null
  } catch {
    return null
  }
}

async function main() {
  const works = await prisma.work.findMany({
    where: {
      section: { in: ['theatre', 'exposition', 'concert', 'visite', 'enfants'] },
      officialUrl: { not: null },
      venueDescription: null,
      NOT: [{ officialUrl: { contains: 'offi.fr' } }, { officialUrl: { contains: 'themoviedb' } }],
    },
    select: { id: true, officialUrl: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })

  let stored = 0
  let empty = 0
  for (const w of works) {
    try {
      const res = await fetch(w.officialUrl!, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
      if (!res.ok) {
        empty += 1
        continue
      }
      const desc = extractDescription(await res.text())
      if (desc && desc.length >= MIN_LEN) {
        await prisma.work.update({ where: { id: w.id }, data: { venueDescription: desc } })
        stored += 1
      } else {
        empty += 1
      }
      await sleep(300)
    } catch {
      empty += 1
    }
  }
  console.log(JSON.stringify({ candidates: works.length, stored, empty }))
}

main()
  .catch((error) => {
    console.error('[backfill-event-descriptions]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
