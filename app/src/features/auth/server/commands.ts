import 'server-only'

import { hash } from 'bcryptjs'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/server/db'
import { registerUserSchema, type RegisterUserInput } from '@/features/auth/schemas'

export async function registerUser(input: RegisterUserInput) {
  const { email, password } = registerUserSchema.parse(input)

  const existingUser = await prisma.user.findUnique({ where: { email } })

  if (existingUser?.passwordHash) {
    throw new Error('email_exists')
  }

  const passwordHash = await hash(password, 10)

  try {
    const user = existingUser
      ? await prisma.user.update({
          where: { email },
          data: { passwordHash },
          select: { id: true, email: true },
        })
      : await prisma.user.create({
          data: { email, passwordHash },
          select: { id: true, email: true },
        })

    return user
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new Error('email_exists')
    }
    throw error
  }
}
