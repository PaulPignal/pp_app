// Enrichit Work.description depuis la page événement du site du lieu (officialUrl),
// UNIQUEMENT pour combler les trous : œuvres dont la description Offi est courte ou
// absente. On délègue l'extraction à scraper/extract_credits_cli.py (même parseur
// que le scraper : itemprop=description → section synopsis → meta). On ne remplace
// que si la description de la page est nettement meilleure (≥150 car. ET plus longue
// que l'actuelle), pour ne jamais dégrader une bonne description Offi.
//
// Re-runnable. Usage : pnpm exec tsx --env-file=.env --env-file=.env.local \
//   scripts/backfill-event-descriptions.ts [limit]
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { prisma } from '@/server/db'

const here = path.dirname(fileURLToPath(import.meta.url))
const scraperDir = path.resolve(here, '../../scraper')
const PY = path.join(scraperDir, '.venv/bin/python')
const CLI = path.join(scraperDir, 'extract_credits_cli.py')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

const MIN_LEN = 150 // en dessous : souvent une date/un slogan, pas un vrai synopsis
const SHORT = 160 // seuil « description Offi à compléter »
const limit = Number(process.argv[2] ?? 5000)
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
      NOT: [{ officialUrl: { contains: 'offi.fr' } }, { officialUrl: { contains: 'themoviedb' } }],
    },
    select: { id: true, officialUrl: true, description: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })
  const gaps = works.filter((w) => !w.description || w.description.trim().length < SHORT)

  let updated = 0
  for (const w of gaps) {
    const current = (w.description ?? '').trim()
    try {
      const res = await fetch(w.officialUrl!, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
      if (!res.ok) continue
      const desc = extractDescription(await res.text())
      // On ne garde que ce qui ressemble à un vrai synopsis et améliore l'existant.
      if (desc && desc.length >= MIN_LEN && desc.length > current.length) {
        await prisma.work.update({ where: { id: w.id }, data: { description: desc } })
        updated += 1
      }
      await sleep(300)
    } catch {
      /* on saute */
    }
  }
  console.log(JSON.stringify({ candidates: gaps.length, updated }))
}

main()
  .catch((error) => {
    console.error('[backfill-event-descriptions]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
