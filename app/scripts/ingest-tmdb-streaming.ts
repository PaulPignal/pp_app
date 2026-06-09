// Ingestion du catalogue « streaming » depuis TMDB (données FR, propulsées par
// JustWatch). Pour chaque plateforme cible, on liste via /discover/movie les films
// disponibles sans surcoût (abonnement/gratuit/ads, PAS location/achat), on agrège
// les plateformes par film, et on upsert des Work(section='streaming').
//
// Pas d'appel détail par film (catalogue large → rapide) : on garde ce que /discover
// fournit (titre, synopsis, affiche, année, genres). Director/durée restent nuls.
//
// Idempotent : re-runnable. Les films qui ont quitté toutes les plateformes voient
// leur `platforms` vidé (→ masqués côté Découverte) sans suppression (réactions
// préservées).
//
// Pré-requis : TMDB_API_KEY (clé v3) dans l'env.
// Usage : pnpm exec tsx --env-file=.env --env-file=.env.local \
//   scripts/ingest-tmdb-streaming.ts [maxPagesPerProvider]
import { prisma } from '@/server/db'

const API = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p/w500'
const KEY = process.env.TMDB_API_KEY
const REGION = 'FR'
const LANG = 'fr-FR'
const MONETIZATION = 'flatrate|free|ads' // inclus sans surcoût ; exclut rent/buy
const maxPages = Number(process.argv[2] ?? 20)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

// Plateformes cibles : nom canonique (affiché/stocké) + alias TMDB possibles.
const TARGETS: { canonical: string; aliases: string[] }[] = [
  { canonical: 'Netflix', aliases: ['netflix'] },
  { canonical: 'Prime Video', aliases: ['amazon prime video', 'prime video'] },
  { canonical: 'Disney+', aliases: ['disney plus', 'disney+'] },
  { canonical: 'Canal+', aliases: ['canal+', 'canal plus', 'canalplus'] },
  { canonical: 'Arte', aliases: ['arte'] },
  { canonical: 'France TV', aliases: ['france tv', 'france.tv', 'francetv'] },
  { canonical: 'TF1+', aliases: ['tf1+', 'mytf1', 'tf1 plus'] },
  { canonical: 'M6+', aliases: ['m6+', '6play', 'm6 plus'] },
]

type Movie = { id: number; title: string; overview: string; poster_path: string | null; release_date: string; genre_ids: number[] }

async function tmdb(path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams({ api_key: KEY!, language: LANG, ...params })
  const res = await fetch(`${API}${path}?${qs}`, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`TMDB ${path} → HTTP ${res.status}`)
  return res.json()
}

async function resolveProviderIds(): Promise<Map<number, string>> {
  const data = await tmdb('/watch/providers/movie', { watch_region: REGION })
  const ids = new Map<number, string>() // provider_id → nom canonique
  for (const p of data.results ?? []) {
    const name = norm(p.provider_name)
    const target = TARGETS.find((t) => t.aliases.includes(name))
    if (target) ids.set(p.provider_id, target.canonical)
  }
  return ids
}

async function genreMap(): Promise<Map<number, string>> {
  const data = await tmdb('/genre/movie/list')
  return new Map<number, string>((data.genres ?? []).map((g: { id: number; name: string }) => [g.id, g.name.toLowerCase()]))
}

async function main() {
  if (!KEY) throw new Error('TMDB_API_KEY manquant (env). Ajoute-le dans app/.env.local')

  const providerIds = await resolveProviderIds()
  if (providerIds.size === 0) throw new Error('Aucune plateforme cible trouvée dans la liste TMDB FR')
  console.log(`[tmdb] plateformes résolues: ${[...new Set(providerIds.values())].join(', ')}`)
  const genres = await genreMap()

  // movie id → { film, plateformes }
  const catalog = new Map<number, { movie: Movie; platforms: Set<string> }>()

  for (const [providerId, canonical] of providerIds) {
    let page = 1
    let totalPages = 1
    do {
      const data = await tmdb('/discover/movie', {
        watch_region: REGION,
        with_watch_monetization_types: MONETIZATION,
        with_watch_providers: String(providerId),
        sort_by: 'popularity.desc',
        page: String(page),
      })
      totalPages = Math.min(data.total_pages ?? 1, maxPages)
      for (const m of (data.results ?? []) as Movie[]) {
        if (!m.title) continue
        const entry = catalog.get(m.id) ?? { movie: m, platforms: new Set<string>() }
        entry.platforms.add(canonical)
        catalog.set(m.id, entry)
      }
      page += 1
      await sleep(120) // throttle poli (TMDB ~50 req/s, on reste loin)
    } while (page <= totalPages)
    console.log(`[tmdb] ${canonical}: catalogue cumulé ${catalog.size} films`)
  }

  const runStart = new Date()
  const records = [...catalog.values()]
  const CONC = 25
  let imported = 0
  for (let i = 0; i < records.length; i += CONC) {
    const chunk = records.slice(i, i + CONC)
    await Promise.all(
      chunk.map(({ movie, platforms }) => {
        const year = movie.release_date ? Number(movie.release_date.slice(0, 4)) || null : null
        const category = movie.genre_ids?.map((g) => genres.get(g)).filter(Boolean).slice(0, 2).join(', ') || null
        const data = {
          title: movie.title,
          section: 'streaming',
          category,
          description: movie.overview?.trim() || null,
          imageUrl: movie.poster_path ? `${IMG}${movie.poster_path}` : null,
          year: year && year >= 1880 && year <= 2100 ? year : null,
          platforms: [...platforms].sort(),
          officialUrl: `https://www.themoviedb.org/movie/${movie.id}/watch?locale=${REGION}`,
        }
        const sourceUrl = `https://www.themoviedb.org/movie/${movie.id}`
        return prisma.work.upsert({
          where: { sourceUrl },
          create: { ...data, sourceUrl },
          update: data,
        })
      }),
    )
    imported += chunk.length
  }

  // Masque les films qui ont quitté toutes les plateformes (pas vus ce run) sans
  // supprimer (réactions préservées) : platforms vidé → exclus de la Découverte.
  const stale = await prisma.work.updateMany({
    where: { section: 'streaming', updatedAt: { lt: runStart }, NOT: { platforms: { isEmpty: true } } },
    data: { platforms: [] },
  })

  console.log(JSON.stringify({ films: catalog.size, imported, staleCleared: stale.count }))
}

main()
  .catch((error) => {
    console.error('[ingest-tmdb-streaming]', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
