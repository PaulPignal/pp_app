// Backfill Work.officialUrl : lien externe dédié de la fiche (rel="external" sur
// offi → site/page du spectacle ou de l'expo). Re-fetch la fiche offi et délègue à
// scraper/extract_credits_cli.py (même logique que le scraper). Re-runnable : ne
// traite que les œuvres sans officialUrl. Présent surtout en expo/concert
// (le théâtre n'expose aucun lien externe sur offi).
//
// Usage : pnpm exec tsx --env-file=.env --env-file=.env.local scripts/backfill-official-url.ts [sections] [limit]
//   sections : liste séparée par des virgules (défaut: exposition,concert)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { prisma } from '@/server/db'

const here = path.dirname(fileURLToPath(import.meta.url))
const scraperDir = path.resolve(here, '../../scraper')
const PY = path.join(scraperDir, '.venv/bin/python')
const CLI = path.join(scraperDir, 'extract_credits_cli.py')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const sections = (process.argv[2] ?? 'exposition,concert').split(',').map((s) => s.trim()).filter(Boolean)
const limit = Number(process.argv[3] ?? 5000)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function extractOfficialUrl(html: string): string | null {
  const res = spawnSync(PY, [CLI], {
    input: html,
    encoding: 'utf-8',
    cwd: scraperDir,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 10_000,
    killSignal: 'SIGKILL',
  })
  if (res.status !== 0 || !res.stdout) return null
  try {
    return JSON.parse(res.stdout)?.official_url ?? null
  } catch {
    return null
  }
}

async function main() {
  const works = await prisma.work.findMany({
    where: { officialUrl: null, section: { in: sections } },
    select: { id: true, sourceUrl: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  let updated = 0
  let missing = 0
  for (const work of works) {
    try {
      const response = await fetch(work.sourceUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
      if (!response.ok) {
        missing += 1
        continue
      }
      const officialUrl = extractOfficialUrl(await response.text())
      if (officialUrl) {
        await prisma.work.update({ where: { id: work.id }, data: { officialUrl } })
        updated += 1
      } else {
        missing += 1
      }
      await sleep(350) // throttle poli envers offi.fr
    } catch {
      missing += 1
    }
  }

  console.log(JSON.stringify({ sections, scanned: works.length, updated, missing }))
}

main()
  .catch((error) => {
    console.error('[backfill-official-url]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
