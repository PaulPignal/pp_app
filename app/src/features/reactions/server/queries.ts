import 'server-only'

import { prisma } from '@/server/db'
import { friendDisplayName, type FriendLikerDto } from '@/features/friendships/dto'
import { mapWorkToCardDto, workCardSelect } from '@/features/works/dto'

export type LikedWorkItem = {
  workId: string
  work: ReturnType<typeof mapWorkToCardDto> | null
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

// Pour chaque œuvre de la bibliothèque (LIKE ou SEEN), les amis (amitié ACCEPTED) qui l'ont likée.
// Une seule requête, sans dépendre de listLibraryWorks : la page lance les deux en parallèle.
export async function friendsWhoLiked(userId: string): Promise<Record<string, FriendLikerDto[]>> {
  const reactions = await prisma.reaction.findMany({
    where: {
      status: 'LIKE',
      user: { friendshipsReceived: { some: { userId, status: 'ACCEPTED' } } },
      work: { reactions: { some: { userId, status: { in: ['LIKE', 'SEEN'] } } } },
    },
    select: { workId: true, user: { select: { id: true, email: true } } },
  })

  const result: Record<string, FriendLikerDto[]> = {}
  for (const r of reactions) {
    ;(result[r.workId] ??= []).push({ id: r.user.id, name: friendDisplayName(r.user.email) })
  }
  return result
}
