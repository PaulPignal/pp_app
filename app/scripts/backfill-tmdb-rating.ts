// Backfill Work.rating / ratingCount pour les films CINÉMA (offi) via TMDB.
// On recherche le film sur TMDB par titre (+ année de production si connue), on
// valide le match de façon conservatrice (slug exact ou ≥60 % des tokens du titre),
// puis on stocke la note publique (vote_average) + le nombre de votes.
// Le streaming récupère sa note directement à l'ingestion → ce backfill cible le ciné.
//
// Re-runnable : ne traite que les films sans rating. Pré-requis : TMDB_API_KEY.
// Usage : pnpm exec tsx --env-file=.env --env-file=.env.local scripts/backfill-tmdb-rating.ts [section] [limit]
import { prisma } from '@/server/db'

const API = 'https://api.themoviedb.org/3'
const KEY = process.env.TMDB_API_KEY
const section = process.argv[2] ?? 'cinema'
const limit = Number(process.argv[3] ?? 5000)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const slugify = (s: string) =>
  (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
const tokens = (s: string) => new Set(slugify(s).split('-').filter((t) => t.length >= 3))

// Match conservateur entre le titre offi et un résultat TMDB.
function isMatch(offiTitle: string, candidate: { title?: string; original_title?: string }): boolean {
  const tt = tokens(offiTitle)
  if (tt.size === 0) return false
  const offiSlug = slugify(offiTitle)
  for (const name of [candidate.title, candidate.original_title]) {
    if (!name) continue
    const cslug = slugify(name)
    if (offiSlug && offiSlug === cslug) return true
    const ct = tokens(name)
    const inter = [...tt].filter((t) => ct.has(t)).length
    if (inter >= 1 && inter / tt.size >= 0.6) return true
  }
  return false
}

async function searchRating(title: string, year: number | null): Promise<{ rating: number; ratingCount: number } | null> {
  const params = new URLSearchParams({ api_key: KEY!, language: 'fr-FR', query: title, include_adult: 'false' })
  if (year) params.set('primary_release_year', String(year))
  const res = await fetch(`${API}/search/movie?${params}`, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) return null
  const data = await res.json()
  const results = (data.results ?? []) as Array<{
    title?: string
    original_title?: string
    vote_average?: number
    vote_count?: number
  }>
  // On parcourt les premiers résultats (les plus pertinents) et on prend le 1er qui matche.
  for (const r of results.slice(0, 5)) {
    if (isMatch(title, r) && typeof r.vote_average === 'number' && r.vote_average > 0) {
      return { rating: r.vote_average, ratingCount: r.vote_count ?? 0 }
    }
  }
  return null
}

async function main() {
  if (!KEY) throw new Error('TMDB_API_KEY manquant (env).')

  const films = await prisma.work.findMany({
    where: { section, rating: null },
    select: { id: true, title: true, year: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  let updated = 0
  let missing = 0
  for (const f of films) {
    try {
      const hit = await searchRating(f.title, f.year)
      if (hit) {
        await prisma.work.update({ where: { id: f.id }, data: { rating: hit.rating, ratingCount: hit.ratingCount } })
        updated += 1
      } else {
        missing += 1
      }
      await sleep(120) // throttle poli (TMDB ~50 req/s)
    } catch {
      missing += 1
    }
  }

  console.log(JSON.stringify({ section, scanned: films.length, updated, missing }))
}

main()
  .catch((error) => {
    console.error('[backfill-tmdb-rating]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
