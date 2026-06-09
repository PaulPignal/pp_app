import 'server-only'

import { prisma } from '@/server/db'
import type { FriendSummaryDto } from '@/features/friendships/dto'
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

// Bibliothèque /likes : likes (à voir) + œuvres marquées vues (déjà vues), en une requête.
export async function listLibraryWorks(userId: string): Promise<{ likes: LikedWorkItem[]; seen: LikedWorkItem[] }> {
  const rows = await prisma.reaction.findMany({
    where: { userId, status: { in: ['LIKE', 'SEEN'] } },
    orderBy: { createdAt: 'desc' },
    select: {
      workId: true,
      status: true,
      work: { select: workCardSelect },
    },
  })

  const likes: LikedWorkItem[] = []
  const seen: LikedWorkItem[] = []
  for (const row of rows) {
    const item = { workId: row.workId, work: row.work ? mapWorkToCardDto(row.work) : null }
    ;(row.status === 'SEEN' ? seen : likes).push(item)
  }
  return { likes, seen }
}

// Pour un ensemble d'œuvres, quels amis (amitié ACCEPTED) les ont aussi likées.
export async function friendsWhoLiked(
  userId: string,
  workIds: string[],
): Promise<Record<string, FriendSummaryDto[]>> {
  const result: Record<string, FriendSummaryDto[]> = {}
  if (workIds.length === 0) return result

  const friendships = await prisma.friendship.findMany({
    where: { userId, status: 'ACCEPTED' },
    select: { friendId: true },
  })
  const friendIds = friendships.map((f) => f.friendId)
  if (friendIds.length === 0) return result

  const reactions = await prisma.reaction.findMany({
    where: { userId: { in: friendIds }, status: 'LIKE', workId: { in: workIds } },
    select: { workId: true, user: { select: { id: true, email: true } } },
  })

  for (const r of reactions) {
    ;(result[r.workId] ??= []).push(r.user)
  }
  return result
}
