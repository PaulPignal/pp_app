// Backfill one-off : remplit Work.director / Work.cast pour les œuvres existantes
// (les nouveaux scrapes les capturent désormais nativement). Récupère la fiche
// Offi, délègue l'extraction à scraper/extract_credits_cli.py (même logique que le
// scraper, zéro duplication), puis met à jour via Prisma.
//
// Usage : pnpm exec tsx --env-file=.env --env-file=.env.local scripts/backfill-credits.ts [limit]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { prisma } from '@/server/db'

const here = path.dirname(fileURLToPath(import.meta.url))
const scraperDir = path.resolve(here, '../../scraper')
const PY = path.join(scraperDir, '.venv/bin/python')
const CLI = path.join(scraperDir, 'extract_credits_cli.py')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const limit = Number(process.argv[2] ?? 40)

function extract(html: string): { director: string | null; cast: string[] } {
  const res = spawnSync(PY, [CLI], {
    input: html,
    encoding: 'utf-8',
    cwd: scraperDir,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 10_000,
    killSignal: 'SIGKILL',
  })
  if (res.status !== 0 || !res.stdout) return { director: null, cast: [] }
  try {
    return JSON.parse(res.stdout)
  } catch {
    return { director: null, cast: [] }
  }
}

async function main() {
  const works = await prisma.work.findMany({
    where: { cast: { isEmpty: true } },
    select: { id: true, sourceUrl: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  let updated = 0
  for (const work of works) {
    try {
      const response = await fetch(work.sourceUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
      if (!response.ok) continue
      const { director, cast } = extract(await response.text())
      if (director || cast.length > 0) {
        await prisma.work.update({ where: { id: work.id }, data: { director, cast } })
        updated += 1
      }
      await new Promise((resolve) => setTimeout(resolve, 400)) // throttle poli envers offi.fr
    } catch {
      // on saute les fiches en erreur, sans interrompre le backfill
    }
  }

  console.log(JSON.stringify({ scanned: works.length, updated }))
}

main()
  .catch((error) => {
    console.error('[backfill-credits]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
