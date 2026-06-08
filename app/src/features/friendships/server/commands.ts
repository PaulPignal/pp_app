import 'server-only'

import { prisma } from '@/server/db'
import { addFriendSchema, type AddFriendInput } from '@/features/friendships/schemas'
import { verifyInviteToken } from '@/features/friendships/server/invite'

type AddFriendCommandInput = {
  userId: string
  userEmail: string
  input: AddFriendInput
}

export type AddFriendResult = {
  friend: { id: string; email: string }
  // 'accepted' : amitié mutuelle effective (lien d'invitation, ou demande croisée).
  // 'pending'  : demande envoyée, en attente d'acceptation par le destinataire.
  status: 'accepted' | 'pending'
}

async function makeMutual(userId: string, friendId: string) {
  await prisma.$transaction([
    prisma.friendship.upsert({
      where: { userId_friendId: { userId, friendId } },
      update: { status: 'ACCEPTED' },
      create: { userId, friendId, status: 'ACCEPTED' },
    }),
    prisma.friendship.upsert({
      where: { userId_friendId: { userId: friendId, friendId: userId } },
      update: { status: 'ACCEPTED' },
      create: { userId: friendId, friendId: userId, status: 'ACCEPTED' },
    }),
  ])
}

export async function addFriend({ userId, userEmail, input }: AddFriendCommandInput): Promise<AddFriendResult> {
  const parsedInput = addFriendSchema.parse(input)

  let friend = null as { id: string; email: string } | null

  if ('token' in parsedInput) {
    // Lien d'invitation : double consentement (partage du lien + clic) → amitié directe.
    const invite = verifyInviteToken(parsedInput.token)
    if (invite.userId === userId) {
      throw new Error('cannot_add_self')
    }

    friend = await prisma.user.findUnique({
      where: { id: invite.userId },
      select: { id: true, email: true },
    })

    if (!friend) {
      throw new Error('friend_not_found')
    }

    await makeMutual(userId, friend.id)
    return { friend, status: 'accepted' }
  }

  // Ajout par email : nécessite le consentement du destinataire → demande PENDING.
  if (parsedInput.email === userEmail) {
    throw new Error('cannot_add_self')
  }

  friend = await prisma.user.findUnique({
    where: { email: parsedInput.email },
    select: { id: true, email: true },
  })

  if (!friend) {
    throw new Error('friend_not_found')
  }

  // Déjà amis (arête sortante ACCEPTED) → idempotent.
  const existingOutgoing = await prisma.friendship.findUnique({
    where: { userId_friendId: { userId, friendId: friend.id } },
    select: { status: true },
  })
  if (existingOutgoing?.status === 'ACCEPTED') {
    return { friend, status: 'accepted' }
  }

  // Le destinataire m'a déjà envoyé une demande → on l'accepte (demande croisée).
  const incoming = await prisma.friendship.findUnique({
    where: { userId_friendId: { userId: friend.id, friendId: userId } },
    select: { status: true },
  })
  if (incoming?.status === 'PENDING') {
    await makeMutual(userId, friend.id)
    return { friend, status: 'accepted' }
  }

  // Sinon : (ré)affirme une demande sortante en attente.
  await prisma.friendship.upsert({
    where: { userId_friendId: { userId, friendId: friend.id } },
    update: { status: 'PENDING' },
    create: { userId, friendId: friend.id, status: 'PENDING' },
  })

  return { friend, status: 'pending' }
}

// Le destinataire (userId) accepte une demande reçue de requesterId.
export async function acceptFriendRequest({ userId, requesterId }: { userId: string; requesterId: string }) {
  const request = await prisma.friendship.findUnique({
    where: { userId_friendId: { userId: requesterId, friendId: userId } },
    select: { status: true },
  })

  if (!request || request.status !== 'PENDING') {
    throw new Error('request_not_found')
  }

  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { id: true, email: true },
  })

  if (!requester) {
    throw new Error('friend_not_found')
  }

  await makeMutual(userId, requesterId)
  return requester
}

// Le destinataire (userId) refuse une demande reçue de requesterId.
export async function declineFriendRequest({ userId, requesterId }: { userId: string; requesterId: string }) {
  await prisma.friendship.deleteMany({
    where: { userId: requesterId, friendId: userId, status: 'PENDING' },
  })
}

// Retire une amitié : supprime les deux arêtes (et toute demande en attente associée).
export async function removeFriend({ userId, friendId }: { userId: string; friendId: string }) {
  await prisma.friendship.deleteMany({
    where: {
      OR: [
        { userId, friendId },
        { userId: friendId, friendId: userId },
      ],
    },
  })
}
