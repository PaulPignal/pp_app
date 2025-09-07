// src/auth.ts — NextAuth v4
import type { NextAuthOptions } from 'next-auth'
import { getServerSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/server/db'
import { compare } from 'bcryptjs'

function isDev() {
  return process.env.NODE_ENV !== 'production'
}

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = (creds?.email ?? '').toString().toLowerCase().trim()
        const password = (creds?.password ?? '').toString()
        if (!email || !password) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
          if (isDev()) console.warn('[auth] user not found for', email)
          return null
        }

        // Supporte passwordHash OU password
        const hash = (user as any).passwordHash ?? (user as any).password
        if (!hash) {
          if (isDev()) console.warn('[auth] no hash field on user')
          return null
        }

        const ok = await compare(password, hash)
        if (!ok) {
          if (isDev()) console.warn('[auth] bad password for', email)
          return null
        }

        return { id: (user as any).id, email: user.email }
      },
    }),
  ],
  pages: { signIn: process.env.NEXT_PUBLIC_SIGNIN_PATH || "/signin", },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) (token as any).uid = (user as any).id
      return token
    },
    async session({ session, token }) {
      if ((token as any)?.uid) (session.user as any).id = (token as any).uid
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

// Helper v4 pour l’App Router : récupérer la session côté serveur
export async function auth() {
  return getServerSession(authOptions)
}