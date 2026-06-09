// Nettoie Venue.metro (et access) là où le parsing a happé du texte parasite
// (dates, noms de lieux concaténés…). On re-fetch UNIQUEMENT les lieux au métro
// suspect, et on ré-extrait avec le parseur amélioré (scraper/parsers._clean_metro) :
// les stations récupérables sont corrigées (« Charonne le 8… » → « Charonne »),
// le bruit irrécupérable est mis à null.
//
// Usage : pnpm exec tsx --env-file=.env --env-file=.env.local scripts/clean-venue-metro.ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { prisma } from '@/server/db'

const here = path.dirname(fileURLToPath(import.meta.url))
const scraperDir = path.resolve(here, '../../scraper')
const PY = path.join(scraperDir, '.venv/bin/python')
const CLI = path.join(scraperDir, 'extract_venue_cli.py')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

// Métro suspect : contient un chiffre, un mot « lieu », ou trop long.
const SUSPECT = /\d|th[ée][âa]tre|mus[ée]e|salle|cin[ée]ma|\bparis\b|spectacle|com[ée]die/i
const isSuspect = (m: string | null) => !!m && (SUSPECT.test(m) || m.length > 32)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

function extract(html: string, url: string, kind: string): { metro: string | null; access: string | null } | null {
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
    const v = JSON.parse(res.stdout)
    return { metro: v?.metro ?? null, access: v?.access ?? null }
  } catch {
    return null
  }
}

async function main() {
  const all = await prisma.venue.findMany({
    where: { metro: { not: null } },
    select: { id: true, kind: true, metro: true, sourceUrl: true },
  })
  const suspects = all.filter((v) => isSuspect(v.metro))
  console.log(`${suspects.length} lieu(x) au métro suspect (sur ${all.length} avec métro)`)

  let fixed = 0
  let nulled = 0
  for (const v of suspects) {
    const html = await fetchHtml(v.sourceUrl)
    const re = html ? extract(html, v.sourceUrl, v.kind) : null
    const newMetro = re?.metro ?? null // parseur amélioré : station propre ou null
    await prisma.venue.update({ where: { id: v.id }, data: { metro: newMetro, ...(re?.access ? { access: re.access } : {}) } })
    if (newMetro) fixed += 1
    else nulled += 1
    await sleep(300)
  }
  console.log(JSON.stringify({ suspects: suspects.length, recoveredClean: fixed, nulled }))
}

main()
  .catch((error) => {
    console.error('[clean-venue-metro]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
