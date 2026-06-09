// Backfill one-off : remplit Work.arrondissement (théâtre) et Work.country/year
// (cinéma) pour les œuvres existantes. Les nouveaux scrapes les capturent
// nativement. Récupère la fiche Offi, délègue l'extraction au CLI Python
// (même logique que le scraper, zéro duplication), puis met à jour via Prisma.
//
// Usage : pnpm exec tsx --env-file=.env --env-file=.env.local scripts/backfill-meta.ts [limit]
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

type Extracted = { arrondissement: string | null; country: string | null; year: number | null }

function extract(html: string): Extracted {
  const res = spawnSync(PY, [CLI], {
    input: html,
    encoding: 'utf-8',
    cwd: scraperDir,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 10_000,
    killSignal: 'SIGKILL',
  })
  if (res.status !== 0 || !res.stdout) return { arrondissement: null, country: null, year: null }
  try {
    const parsed = JSON.parse(res.stdout)
    return { arrondissement: parsed.arrondissement ?? null, country: parsed.country ?? null, year: parsed.year ?? null }
  } catch {
    return { arrondissement: null, country: null, year: null }
  }
}

async function main() {
  // Œuvres encore sans aucune des nouvelles métadonnées.
  const works = await prisma.work.findMany({
    where: { arrondissement: null, country: null, year: null },
    select: { id: true, sourceUrl: true, section: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  let updated = 0
  for (const work of works) {
    try {
      const response = await fetch(work.sourceUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
      if (!response.ok) continue
      const { arrondissement, country, year } = extract(await response.text())

      // On ne renseigne que ce qui a du sens par segment.
      const data: { arrondissement?: string; country?: string; year?: number } = {}
      if (work.section === 'theatre' && arrondissement) data.arrondissement = arrondissement
      if (work.section === 'cinema') {
        if (country) data.country = country
        if (year) data.year = year
      }

      if (Object.keys(data).length > 0) {
        await prisma.work.update({ where: { id: work.id }, data })
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
    console.error('[backfill-meta]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
