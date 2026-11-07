import 'server-only'

import type { NextAuthOptions } from 'next-auth'
import { getServerSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { DUMMY_PASSWORD_HASH, upgradePasswordHash } from '@/features/auth/server/commands'
import { normalizeEmail } from '@/features/auth/schemas'
import { prisma } from '@/server/db'
import { env } from '@/server/env'
import { clientIp, rateLimit } from '@/shared/lib/rate-limit'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

function isDev() {
  return process.env.NODE_ENV !== 'production'
}

export const authOptions: NextAuthOptions = {
  // 7 jours : un JWT ne se révoque pas, sa durée de vie borne une session volée.
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: { email: {}, password: {} },
      async authorize(credentials, req) {
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

        // Deux clés : l'email (force brute sur un compte) et l'IP (un script qui balaie des
        // milliers d'emails, chaque essai coûtant un bcrypt de coût 12).
        const limit = rateLimit(`login:${email}`, 10, 5 * 60_000)
        const ipLimit = rateLimit(`login-ip:${clientIp({ headers: req?.headers ?? {} })}`, 50, 5 * 60_000)
        if (!limit.ok || !ipLimit.ok) {
          if (isDev()) console.warn('[auth] rate limited for', email)
          return null
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, passwordHash: true },
          })
          if (!user) {
            // Même coût bcrypt qu'un vrai compte : la durée de réponse ne révèle pas l'existence de l'email.
            await compare(password, DUMMY_PASSWORD_HASH)
            if (isDev()) console.warn('[auth] user not found for', email)
            return null
          }

          const ok = await compare(password, user.passwordHash)
          if (!ok) {
            if (isDev()) console.warn('[auth] bad password for', email)
            return null
          }

          await upgradePasswordHash(user.id, password, user.passwordHash)

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
