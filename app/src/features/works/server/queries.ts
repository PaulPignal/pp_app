import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { getParisTodayStart } from '@/features/works/availability'
import { listDiscoverWorksParamsSchema, type ListDiscoverWorksParams } from '@/features/works/schemas'
import { mapWorkToCardDto, workCardSelect } from '@/features/works/dto'

type ListDiscoverWorksInput = Partial<ListDiscoverWorksParams> & {
  userId?: string | null
}

export async function listDiscoverWorks(input: ListDiscoverWorksInput = {}) {
  const { per, since, category, section, platforms } = listDiscoverWorksParamsSchema.parse(input)
  const where: Prisma.WorkWhereInput = {
    OR: [{ endDate: null }, { endDate: { gte: getParisTodayStart() } }],
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
export async function listStreamingPlatforms(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ p: string }[]>`
    SELECT DISTINCT unnest(platforms) AS p
    FROM "Work"
    WHERE section = 'streaming'
    ORDER BY p`
  return rows.map((r) => r.p)
}
