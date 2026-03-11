import 'server-only'

import { auth } from '@/auth'

export type SessionUser = {
  id: string
  email: string
}

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized')
    this.name = 'UnauthorizedError'
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  const id = session?.user?.id
  const email = session?.user?.email

  if (!id || !email) {
    return null
  }

  return { id, email: email.toLowerCase().trim() }
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser()

  if (!user) {
    throw new UnauthorizedError()
  }

  return user
}

export function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return error instanceof UnauthorizedError
}
