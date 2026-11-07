import { beforeEach, describe, expect, it, vi } from 'vitest'

// Câblage seulement (prisma simulé) : vérifie qu'ouvrir un lien n'écrit rien.
const { prisma, verifyInviteTokenMock } = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    friendship: { upsert: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  verifyInviteTokenMock: vi.fn(),
}))

vi.mock('@/server/db', () => ({ prisma }))
vi.mock('@/features/friendships/server/invite', () => ({ verifyInviteToken: verifyInviteTokenMock }))

import { getInvitePreview } from '@/features/friendships/server/queries'

describe('getInvitePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('nomme l’inviteur sans créer d’amitié', async () => {
    verifyInviteTokenMock.mockReturnValue({ userId: 'inviter' })
    prisma.user.findUnique.mockResolvedValue({ email: 'lea@example.com' })

    await expect(getInvitePreview('me', 'tok')).resolves.toEqual({ token: 'tok', inviterEmail: 'lea@example.com' })
    expect(prisma.friendship.upsert).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('jeton expiré ou falsifié', async () => {
    verifyInviteTokenMock.mockImplementationOnce(() => {
      throw new Error('expired_invite_token')
    })
    await expect(getInvitePreview('me', 'tok')).resolves.toEqual({ error: 'expired_invite_token' })

    verifyInviteTokenMock.mockImplementationOnce(() => {
      throw new SyntaxError('bad json')
    })
    await expect(getInvitePreview('me', 'tok')).resolves.toEqual({ error: 'invalid_invite_token' })
  })

  it('son propre lien, ou inviteur supprimé', async () => {
    verifyInviteTokenMock.mockReturnValue({ userId: 'me' })
    await expect(getInvitePreview('me', 'tok')).resolves.toEqual({ error: 'cannot_add_self' })

    verifyInviteTokenMock.mockReturnValue({ userId: 'gone' })
    prisma.user.findUnique.mockResolvedValue(null)
    await expect(getInvitePreview('me', 'tok')).resolves.toEqual({ error: 'invalid_invite_token' })
  })
})
