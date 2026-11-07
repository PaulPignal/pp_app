import 'server-only'

import { prisma } from '@/server/db'
import type { FriendRequestDto, FriendSummaryDto, InvitePreviewDto } from '@/features/friendships/dto'
import { verifyInviteToken } from '@/features/friendships/server/invite'

// Lien d'invitation ouvert : vérifie le jeton et nomme l'inviteur, sans rien écrire.
// L'amitié n'est créée qu'au clic sur « Accepter » (POST /api/friends).
export async function getInvitePreview(userId: string, token: string): Promise<InvitePreviewDto> {
  let inviterId: string
  try {
    inviterId = verifyInviteToken(token).userId
  } catch (error) {
    const expired = error instanceof Error && error.message === 'expired_invite_token'
    return { error: expired ? 'expired_invite_token' : 'invalid_invite_token' }
  }
  if (inviterId === userId) return { error: 'cannot_add_self' }

  const inviter = await prisma.user.findUnique({ where: { id: inviterId }, select: { email: true } })
  if (!inviter) return { error: 'invalid_invite_token' }
  return { token, inviterEmail: inviter.email }
}

export async function listFriends(userId: string): Promise<FriendSummaryDto[]> {
  const friendships = await prisma.friendship.findMany({
    where: { userId, status: 'ACCEPTED' },
    select: {
      friend: {
        select: {
          id: true,
          email: true,
        },
      },
    },
    orderBy: {
      friend: {
        email: 'asc',
      },
    },
  })

  return friendships.map((friendship) => friendship.friend)
}

// Demandes reçues en attente : arêtes PENDING dont je suis la cible (friendId).
export async function listIncomingRequests(userId: string): Promise<FriendRequestDto[]> {
  const requests = await prisma.friendship.findMany({
    where: { friendId: userId, status: 'PENDING' },
    select: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
    orderBy: {
      user: {
        email: 'asc',
      },
    },
  })

  return requests.map((request) => request.user)
}
