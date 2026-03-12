import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { listDiscoverWorksParamsSchema, type ListDiscoverWorksParams } from '@/features/works/schemas'
import { mapWorkToCardDto, workCardSelect } from '@/features/works/dto'

type ListDiscoverWorksInput = Partial<ListDiscoverWorksParams> & {
  userId?: string | null
}

export async function listDiscoverWorks(input: ListDiscoverWorksInput = {}) {
  const { per, since, category, section } = listDiscoverWorksParamsSchema.parse(input)
  const where: Prisma.WorkWhereInput = {}

  if (since) {
    where.createdAt = { gte: since }
  }

  if (category) {
    where.category = category
  }

  if (section) {
    where.section = section
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
