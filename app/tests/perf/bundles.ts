/**
 * Budget des bundles client, par route, mesuré sur un build de production.
 *
 * Next 16 (Turbopack) n'affiche plus « First Load JS » : on reconstruit la liste
 * des chunks chargés par chaque route depuis son page_client-reference-manifest.js
 * (tous les modules client référencés) + le runtime partagé (rootMainFiles).
 *
 *   pnpm build && pnpm exec tsx tests/perf/bundles.ts
 *
 * Sort en erreur si une route dépasse son budget (gzip). Les budgets sont posés
 * juste au-dessus des valeurs mesurées le 07/11/2026 : toute régression se voit.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..', '..')
const NEXT = path.join(ROOT, '.next')

// Budgets gzip (Ko) par route, appliqués aux pages de l'application.
const BUDGET_GZ_KB: Record<string, number> = {
  '/(auth)/signin/page': 200,
  '/(auth)/signup/page': 200,
  '/discover/page': 215,
  '/likes/page': 215,
  '/friends/page': 215,
}

type Size = { raw: number; gz: number }
const cache = new Map<string, Size>()

function sizeOf(file: string): Size {
  const rel = file.replace(/^\/_next\//, '')
  const cached = cache.get(rel)
  if (cached) return cached
  const p = path.join(NEXT, rel)
  const size = fs.existsSync(p)
    ? (() => {
        const buf = fs.readFileSync(p)
        return { raw: buf.length, gz: zlib.gzipSync(buf, { level: 9 }).length }
      })()
    : { raw: 0, gz: 0 }
  cache.set(rel, size)
  return size
}

function sum(files: Iterable<string>) {
  let raw = 0
  let gz = 0
  let count = 0
  for (const f of files) {
    const s = sizeOf(f)
    raw += s.raw
    gz += s.gz
    count += 1
  }
  return { files: count, rawKB: +(raw / 1024).toFixed(1), gzKB: +(gz / 1024).toFixed(1) }
}

function walk(dir: string, match: (name: string) => boolean, acc: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, match, acc)
    else if (match(entry.name)) acc.push(p)
  }
  return acc
}

if (!fs.existsSync(path.join(NEXT, 'build-manifest.json'))) {
  console.error('Aucun build trouvé : lancez `pnpm build` d’abord.')
  process.exit(2)
}

const buildManifest = JSON.parse(fs.readFileSync(path.join(NEXT, 'build-manifest.json'), 'utf8')) as {
  rootMainFiles?: string[]
  polyfillFiles?: string[]
}
const shared = [...(buildManifest.rootMainFiles ?? []), ...(buildManifest.polyfillFiles ?? [])]

const rows: Record<string, ReturnType<typeof sum>> = {}
for (const manifest of walk(path.join(NEXT, 'server', 'app'), (n) => n === 'page_client-reference-manifest.js').sort()) {
  const src = fs.readFileSync(manifest, 'utf8')
  const route = /__RSC_MANIFEST\["([^"]+)"\]/.exec(src)?.[1] ?? path.relative(path.join(NEXT, 'server', 'app'), manifest)
  const chunks = new Set(shared)
  for (const m of src.matchAll(/"chunks":\[([^\]]*)\]/g)) {
    for (const c of m[1].split(',')) {
      const v = c.trim().replace(/^"|"$/g, '')
      if (v.endsWith('.js')) chunks.add(v)
    }
  }
  rows[route] = sum(chunks)
}
rows['(runtime partagé)'] = sum(new Set(shared))
rows['(tous les chunks)'] = sum(walk(path.join(NEXT, 'static', 'chunks'), (n) => n.endsWith('.js')).map((p) => path.relative(NEXT, p)))
rows['(css)'] = sum(walk(path.join(NEXT, 'static'), (n) => n.endsWith('.css')).map((p) => path.relative(NEXT, p)))

console.table(rows)

let failed = false
for (const [route, budget] of Object.entries(BUDGET_GZ_KB)) {
  const measured = rows[route]?.gzKB
  if (measured === undefined) continue
  if (measured > budget) {
    failed = true
    console.error(`Budget dépassé : ${route} = ${measured} Ko gzip (budget ${budget} Ko)`)
  }
}
if (process.env.BUNDLES_JSON) fs.writeFileSync(process.env.BUNDLES_JSON, JSON.stringify(rows, null, 2))
process.exit(failed ? 1 : 0)
