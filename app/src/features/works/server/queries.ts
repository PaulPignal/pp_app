import 'server-only'

import { unstable_cache } from 'next/cache'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { getParisTodayStart, getStaleCutoff } from '@/features/works/availability'
import { listDiscoverWorksParamsSchema, type ListDiscoverWorksParams } from '@/features/works/schemas'
import { mapWorkToCardDto, workCardSelect } from '@/features/works/dto'

type ListDiscoverWorksInput = Partial<ListDiscoverWorksParams> & {
  userId?: string | null
}

export async function listDiscoverWorks(input: ListDiscoverWorksInput = {}) {
  const { per, since, category, section, platforms } = listDiscoverWorksParamsSchema.parse(input)
  const where: Prisma.WorkWhereInput = {
    AND: [
      // Encore à l'affiche d'après la date de fin fournie par offi.
      { OR: [{ endDate: null }, { endDate: { gte: getParisTodayStart() } }] },
      // Encore vue par le crawl. `updatedAt` est le dernier passage de l'ingestion sur
      // la fiche, et l'ingestion n'upserte que ce que le crawl a ramené : une œuvre
      // disparue du programme (film qui quitte les salles, sans date de fin côté offi)
      // est donc masquée sans être supprimée, les réactions restent intactes. Une fiche
      // qui réapparaît reçoit un updatedAt frais et revient d'elle-même.
      // `streaming` est exclu : sa visibilité est portée par `platforms`, et son
      // rafraîchissement (TMDB) est indépendant du crawl offi.
      { OR: [{ section: 'streaming' }, { updatedAt: { gte: getStaleCutoff() } }] },
    ],
  }

  if (since) {
    where.createdAt = { gte: since }
  }

  if (category) {
    where.category = category
  }

  if (section) {
    where.section = section
  }

  // Streaming : ne montrer que les films réellement dispo (≥ 1 plateforme) et
  // appliquer le filtre plateformes éventuel (sinon le filtre s'applique tel quel).
  if (section === 'streaming') {
    where.platforms = platforms ? { hasSome: platforms } : { isEmpty: false }
  } else if (platforms) {
    where.platforms = { hasSome: platforms }
  }

  if (input.userId) {
    where.reactions = { none: { userId: input.userId } }
  }

  const [total, works] = await Promise.all([
    prisma.work.count({ where }),
    prisma.work.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: per,
      select: workCardSelect,
    }),
  ])

  return {
    total,
    items: works.map(mapWorkToCardDto),
  }
}

// Plateformes de streaming présentes dans le catalogue (options du filtre Découverte).
// Mis en cache (revalidation 1 h) : le catalogue ne change qu'au refresh hebdo →
// inutile de relancer ce DISTINCT à chaque chargement / clic de filtre.
export const listStreamingPlatforms = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await prisma.$queryRaw<{ p: string }[]>`
      SELECT DISTINCT unnest(platforms) AS p
      FROM "Work"
      WHERE section = 'streaming'
      ORDER BY p`
    return rows.map((r) => r.p)
  },
  ['streaming-platforms'],
  { revalidate: 3600 },
)
