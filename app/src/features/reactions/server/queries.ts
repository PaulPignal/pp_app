import 'server-only'

import { prisma } from '@/server/db'
import { mapWorkToCardDto, workCardSelect } from '@/features/works/dto'

export type LikedWorkItem = {
  workId: string
  work: ReturnType<typeof mapWorkToCardDto> | null
}

export async function listLikedWorks(userId: string): Promise<LikedWorkItem[]> {
  const likes = await prisma.reaction.findMany({
    where: { userId, status: 'LIKE' },
    orderBy: { createdAt: 'desc' },
    select: {
      workId: true,
      work: {
        select: workCardSelect,
      },
    },
  })

  return likes.map((like) => ({
    workId: like.workId,
    work: like.work ? mapWorkToCardDto(like.work) : null,
  }))
}
