// src/server/db.ts
import { PrismaClient } from '@prisma/client'

type GlobalPrisma = typeof globalThis & { prisma?: PrismaClient }
const globalForPrisma = globalThis as GlobalPrisma

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  })

/**
 * Exécute les PRAGMA uniquement en SQLite.
 * (Sur Postgres/Neon, ces commandes provoquent une erreur de syntaxe.)
 */
const dbUrl = process.env.DATABASE_URL ?? ''
const isSqlite = /^(file:|sqlite:)/i.test(dbUrl)

if (isSqlite) {
  ;(async () => {
    try {
      await prisma.$queryRawUnsafe(`PRAGMA journal_mode=WAL;`)
      await prisma.$queryRawUnsafe(`PRAGMA busy_timeout=3000;`)
      await prisma.$queryRawUnsafe(`PRAGMA synchronous=NORMAL;`)
    } catch (e) {
      console.error('[DB] PRAGMA init failed', e)
    }
  })()
}

// Conserver un singleton en dev pour éviter de multiplier les connexions
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
