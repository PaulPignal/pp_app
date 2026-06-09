// Backfill one-off : remplit Work.availability / Work.currency (et corrige les prix
// depuis le bloc `offers`, plus fiable) pour les œuvres existantes. Les nouveaux
// scrapes les capturent nativement. Délègue l'extraction au CLI Python.
//
// Usage : pnpm exec tsx --env-file=.env --env-file=.env.local scripts/backfill-offers.ts [limit]
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

type Offers = { availability: string | null; currency: string | null; price_min: number | null; price_max: number | null }

function extract(html: string): Offers {
  const res = spawnSync(PY, [CLI], {
    input: html,
    encoding: 'utf-8',
    cwd: scraperDir,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 10_000,
    killSignal: 'SIGKILL',
  })
  const empty: Offers = { availability: null, currency: null, price_min: null, price_max: null }
  if (res.status !== 0 || !res.stdout) return empty
  try {
    const p = JSON.parse(res.stdout)
    return {
      availability: p.availability ?? null,
      currency: p.currency ?? null,
      price_min: p.price_min ?? null,
      price_max: p.price_max ?? null,
    }
  } catch {
    return empty
  }
}

async function main() {
  const works = await prisma.work.findMany({
    where: { availability: null },
    select: { id: true, sourceUrl: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  let updated = 0
  for (const work of works) {
    try {
      const response = await fetch(work.sourceUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
      if (!response.ok) continue
      const offers = extract(await response.text())

      const data: { availability?: string; currency?: string; priceMin?: number; priceMax?: number } = {}
      if (offers.availability) data.availability = offers.availability
      if (offers.currency) data.currency = offers.currency
      if (offers.price_min != null) {
        data.priceMin = offers.price_min
        data.priceMax = offers.price_max ?? offers.price_min
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
    console.error('[backfill-offers]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
