import 'server-only'

import { prisma } from '@/server/db'
import { addFriendSchema, type AddFriendInput } from '@/features/friendships/schemas'
import { verifyInviteToken } from '@/features/friendships/server/invite'

type AddFriendCommandInput = {
  userId: string
  userEmail: string
  input: AddFriendInput
}

export async function addFriend({ userId, userEmail, input }: AddFriendCommandInput) {
  const parsedInput = addFriendSchema.parse(input)

  let friend = null as { id: string; email: string } | null

  if ('token' in parsedInput) {
    const invite = verifyInviteToken(parsedInput.token)
    if (invite.userId === userId) {
      throw new Error('cannot_add_self')
    }

    friend = await prisma.user.findUnique({
      where: { id: invite.userId },
      select: { id: true, email: true },
    })
  } else {
    if (parsedInput.email === userEmail) {
      throw new Error('cannot_add_self')
    }

    friend = await prisma.user.findUnique({
      where: { email: parsedInput.email },
      select: { id: true, email: true },
    })
  }

  if (!friend) {
    throw new Error('friend_not_found')
  }

  await prisma.$transaction([
    prisma.friendship.upsert({
      where: { userId_friendId: { userId, friendId: friend.id } },
      update: {},
      create: { userId, friendId: friend.id },
    }),
    prisma.friendship.upsert({
      where: { userId_friendId: { userId: friend.id, friendId: userId } },
      update: {},
      create: { userId: friend.id, friendId: userId },
    }),
  ])

  return friend
}
