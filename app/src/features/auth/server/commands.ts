import 'server-only'

import { getRounds, hash } from 'bcryptjs'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { registerUserSchema, type RegisterUserInput } from '@/features/auth/schemas'

// Coût bcrypt : 12 (≈ 400 ms en bcryptjs sur un portable récent, contre 100 ms en 10).
export const BCRYPT_COST = 12

// Hash bcrypt (coût 12) d'une valeur aléatoire jetée : sert à comparer quand l'email est inconnu.
export const DUMMY_PASSWORD_HASH = '$2b$12$9lkayH6DROY2mVeZQORAI.YqVzJq7lwEtsVTusYf4pPQAa58cuooW'

// Comptes créés en coût 10 : rehash en coût 12 à la connexion réussie (seul moment où le mot de passe est connu).
export async function upgradePasswordHash(userId: string, password: string, currentHash: string) {
  if (getRounds(currentHash) >= BCRYPT_COST) return
  try {
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hash(password, BCRYPT_COST) } })
  } catch (error) {
    console.error('[auth] password hash upgrade failed:', error)
  }
}

// Inscription = création seulement. Un email déjà pris échoue sur la contrainte d'unicité
// (P2002), sans lecture préalable : un aller-retour en moins, même durée de réponse que
// l'email soit libre ou pris, et aucun chemin qui réécrirait le mot de passe d'un compte.
export async function registerUser(input: RegisterUserInput) {
  const { email, password } = registerUserSchema.parse(input)
  const passwordHash = await hash(password, BCRYPT_COST)

  try {
    return await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new Error('email_exists')
    }
    throw error
  }
}
