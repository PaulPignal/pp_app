import 'server-only'

import type { NextAuthOptions } from 'next-auth'
import { getServerSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { normalizeEmail } from '@/features/auth/schemas'
import { prisma } from '@/server/db'
import { env } from '@/server/env'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

function isDev() {
  return process.env.NODE_ENV !== 'production'
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const rawEmail = (credentials?.email ?? '').toString()
        const password = (credentials?.password ?? '').toString()

        if (!rawEmail || !password) {
          return null
        }

        let email: string
        try {
          email = normalizeEmail(rawEmail)
        } catch {
          return null
        }

        try {
          const user = await prisma.user.findUnique({ where: { email } })
          if (!user) {
            if (isDev()) console.warn('[auth] user not found for', email)
            return null
          }

          const ok = await compare(password, user.passwordHash)
          if (!ok) {
            if (isDev()) console.warn('[auth] bad password for', email)
            return null
          }

          return { id: user.id, email: user.email }
        } catch (error) {
          console.error('Database error during auth:', error)
          return null
        }
      },
    }),
  ],
  pages: { signIn: SIGN_IN_PATH },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid
      }
      return session
    },
  },
  secret: env.NEXTAUTH_SECRET,
}

export async function auth() {
  return getServerSession(authOptions)
}
