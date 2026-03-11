import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, verifyInviteTokenMock } = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    friendship: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  verifyInviteTokenMock: vi.fn(),
}))

vi.mock('@/server/db', () => ({ prisma }))
vi.mock('@/features/friendships/server/invite', () => ({
  verifyInviteToken: verifyInviteTokenMock,
}))

import { addFriend } from '@/features/friendships/server/commands'

describe('addFriend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  })

  it('rejects adding yourself via invite token', async () => {
    verifyInviteTokenMock.mockReturnValue({ userId: 'me' })

    await expect(
      addFriend({
        userId: 'me',
        userEmail: 'me@example.com',
        input: { token: 'x'.repeat(32) },
      }),
    ).rejects.toThrow('cannot_add_self')
  })

  it('creates the two symmetric friendship rows', async () => {
    verifyInviteTokenMock.mockReturnValue({ userId: 'friend-1' })
    prisma.user.findUnique.mockResolvedValue({ id: 'friend-1', email: 'friend@example.com' })
    prisma.friendship.upsert.mockResolvedValue({})

    const result = await addFriend({
      userId: 'me',
      userEmail: 'me@example.com',
      input: { token: 'x'.repeat(32) },
    })

    expect(result).toEqual({ id: 'friend-1', email: 'friend@example.com' })
    expect(prisma.friendship.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { userId_friendId: { userId: 'me', friendId: 'friend-1' } },
      }),
    )
    expect(prisma.friendship.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { userId_friendId: { userId: 'friend-1', friendId: 'me' } },
      }),
    )
  })
})
