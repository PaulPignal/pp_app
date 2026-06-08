import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, verifyInviteTokenMock } = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    friendship: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  verifyInviteTokenMock: vi.fn(),
}))

vi.mock('@/server/db', () => ({ prisma }))
vi.mock('@/features/friendships/server/invite', () => ({
  verifyInviteToken: verifyInviteTokenMock,
}))

import {
  acceptFriendRequest,
  addFriend,
  declineFriendRequest,
  removeFriend,
} from '@/features/friendships/server/commands'

describe('addFriend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
    prisma.friendship.findUnique.mockResolvedValue(null)
  })

  it('rejects adding yourself via invite token', async () => {
    verifyInviteTokenMock.mockReturnValue({ userId: 'me' })

    await expect(
      addFriend({ userId: 'me', userEmail: 'me@example.com', input: { token: 'x'.repeat(32) } }),
    ).rejects.toThrow('cannot_add_self')
  })

  it('invite token → amitié mutuelle ACCEPTED', async () => {
    verifyInviteTokenMock.mockReturnValue({ userId: 'friend-1' })
    prisma.user.findUnique.mockResolvedValue({ id: 'friend-1', email: 'friend@example.com' })
    prisma.friendship.upsert.mockResolvedValue({})

    const result = await addFriend({
      userId: 'me',
      userEmail: 'me@example.com',
      input: { token: 'x'.repeat(32) },
    })

    expect(result).toEqual({ friend: { id: 'friend-1', email: 'friend@example.com' }, status: 'accepted' })
    expect(prisma.friendship.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { userId_friendId: { userId: 'me', friendId: 'friend-1' } },
        create: { userId: 'me', friendId: 'friend-1', status: 'ACCEPTED' },
      }),
    )
    expect(prisma.friendship.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { userId_friendId: { userId: 'friend-1', friendId: 'me' } },
      }),
    )
  })

  it('email → demande PENDING (consentement requis)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'friend-1', email: 'friend@example.com' })
    prisma.friendship.findUnique.mockResolvedValue(null)
    prisma.friendship.upsert.mockResolvedValue({})

    const result = await addFriend({
      userId: 'me',
      userEmail: 'me@example.com',
      input: { email: 'friend@example.com' },
    })

    expect(result).toEqual({ friend: { id: 'friend-1', email: 'friend@example.com' }, status: 'pending' })
    expect(prisma.friendship.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.friendship.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_friendId: { userId: 'me', friendId: 'friend-1' } },
        create: { userId: 'me', friendId: 'friend-1', status: 'PENDING' },
      }),
    )
  })

  it('email → demande croisée : si l’autre m’a déjà invité, on accepte', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'friend-1', email: 'friend@example.com' })
    // 1er findUnique (arête sortante) → null ; 2e (arête entrante) → PENDING
    prisma.friendship.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: 'PENDING' })
    prisma.friendship.upsert.mockResolvedValue({})

    const result = await addFriend({
      userId: 'me',
      userEmail: 'me@example.com',
      input: { email: 'friend@example.com' },
    })

    expect(result.status).toBe('accepted')
    expect(prisma.friendship.upsert).toHaveBeenCalledTimes(2)
  })

  it('email → déjà amis : idempotent (accepted, pas d’upsert)', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'friend-1', email: 'friend@example.com' })
    prisma.friendship.findUnique.mockResolvedValueOnce({ status: 'ACCEPTED' })

    const result = await addFriend({
      userId: 'me',
      userEmail: 'me@example.com',
      input: { email: 'friend@example.com' },
    })

    expect(result.status).toBe('accepted')
    expect(prisma.friendship.upsert).not.toHaveBeenCalled()
  })

  it('email → compte introuvable', async () => {
    prisma.user.findUnique.mockResolvedValue(null)

    await expect(
      addFriend({ userId: 'me', userEmail: 'me@example.com', input: { email: 'ghost@example.com' } }),
    ).rejects.toThrow('friend_not_found')
  })
})

describe('acceptFriendRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  })

  it('accepte une demande PENDING reçue → mutuelle', async () => {
    prisma.friendship.findUnique.mockResolvedValue({ status: 'PENDING' })
    prisma.user.findUnique.mockResolvedValue({ id: 'req-1', email: 'req@example.com' })
    prisma.friendship.upsert.mockResolvedValue({})

    const friend = await acceptFriendRequest({ userId: 'me', requesterId: 'req-1' })

    expect(friend).toEqual({ id: 'req-1', email: 'req@example.com' })
    expect(prisma.friendship.findUnique).toHaveBeenCalledWith({
      where: { userId_friendId: { userId: 'req-1', friendId: 'me' } },
      select: { status: true },
    })
    expect(prisma.friendship.upsert).toHaveBeenCalledTimes(2)
  })

  it('rejette si aucune demande en attente', async () => {
    prisma.friendship.findUnique.mockResolvedValue(null)

    await expect(acceptFriendRequest({ userId: 'me', requesterId: 'req-1' })).rejects.toThrow('request_not_found')
  })
})

describe('declineFriendRequest / removeFriend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('decline supprime l’arête PENDING entrante', async () => {
    prisma.friendship.deleteMany.mockResolvedValue({ count: 1 })
    await declineFriendRequest({ userId: 'me', requesterId: 'req-1' })
    expect(prisma.friendship.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'req-1', friendId: 'me', status: 'PENDING' },
    })
  })

  it('removeFriend supprime les deux arêtes', async () => {
    prisma.friendship.deleteMany.mockResolvedValue({ count: 2 })
    await removeFriend({ userId: 'me', friendId: 'friend-1' })
    expect(prisma.friendship.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userId: 'me', friendId: 'friend-1' },
          { userId: 'friend-1', friendId: 'me' },
        ],
      },
    })
  })
})
