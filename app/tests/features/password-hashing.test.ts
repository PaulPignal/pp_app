import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRounds, hashSync } from 'bcryptjs'

const { prisma } = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('@/server/db', () => ({ prisma }))
vi.mock('@/server/env', () => ({ env: { NEXTAUTH_SECRET: 'unit-test-secret-at-least-32-bytes-long!!' } }))

import { Prisma } from '@/generated/prisma/client'
import { fitsBcryptLimit, isPasswordAcceptable } from '@/features/auth/password-policy'
import { registerUserSchema } from '@/features/auth/schemas'
import { BCRYPT_COST, DUMMY_PASSWORD_HASH, registerUser, upgradePasswordHash } from '@/features/auth/server/commands'
import { authOptions } from '@/server/auth/config'

describe('limite bcrypt de 72 octets', () => {
  it('compte en octets UTF-8, pas en caractères', () => {
    expect(fitsBcryptLimit('a'.repeat(72))).toBe(true)
    expect(fitsBcryptLimit('a'.repeat(73))).toBe(false)
    expect(fitsBcryptLimit('é'.repeat(36))).toBe(true) // 72 octets
    expect(fitsBcryptLimit('é'.repeat(37))).toBe(false) // 74 octets pour 37 caractères
  })

  it('le formulaire et le schéma serveur refusent un mot de passe trop long', () => {
    const tooLong = `Aa1${'é'.repeat(35)}` // 38 caractères, 73 octets
    expect(isPasswordAcceptable(tooLong)).toBe(false)
    expect(registerUserSchema.safeParse({ email: 'a@b.fr', password: tooLong }).success).toBe(false)
    expect(registerUserSchema.safeParse({ email: 'a@b.fr', password: 'Abcdefghijk1' }).success).toBe(true)
  })
})

describe('hash bcrypt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inscription en coût 12', async () => {
    prisma.user.create.mockImplementation(async ({ data }: { data: { email: string; passwordHash: string } }) => ({
      id: 'u1',
      email: data.email,
      hash: data.passwordHash,
    }))
    await registerUser({ email: 'new@example.com', password: 'Abcdefghijk1' })
    const { passwordHash } = prisma.user.create.mock.calls[0][0].data
    expect(getRounds(passwordHash)).toBe(12)
    expect(BCRYPT_COST).toBe(12)
    expect(getRounds(DUMMY_PASSWORD_HASH)).toBe(12)
    // Aucune lecture ni mise à jour : un compte existant ne peut pas voir son mot de passe réécrit.
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('email déjà pris : la contrainte d’unicité donne email_exists', async () => {
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '7' }),
    )
    await expect(registerUser({ email: 'taken@example.com', password: 'Abcdefghijk1' })).rejects.toThrow('email_exists')
  })

  it('un ancien hash de coût inférieur à 12 est remplacé à la connexion, pas un hash en coût 12', async () => {
    await upgradePasswordHash('u1', 'Abcdefghijk1', hashSync('Abcdefghijk1', 4))
    expect(prisma.user.update).toHaveBeenCalledTimes(1)
    expect(getRounds(prisma.user.update.mock.calls[0][0].data.passwordHash)).toBe(12)

    prisma.user.update.mockClear()
    await upgradePasswordHash('u1', 'x', DUMMY_PASSWORD_HASH)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})

describe('session', () => {
  it('JWT valable 7 jours', () => {
    expect(authOptions.session).toMatchObject({ strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 })
  })
})
