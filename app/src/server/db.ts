// src/server/db.ts
import { PrismaClient } from '@prisma/client'
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  })

async function initSqlitePragmas() {
  try {
    // Certains PRAGMA renvoient une ligne ⇒ utiliser queryRaw*
    await prisma.$queryRawUnsafe(`PRAGMA journal_mode=WAL;`)
    await prisma.$queryRawUnsafe(`PRAGMA busy_timeout=3000;`)
    await prisma.$queryRawUnsafe(`PRAGMA synchronous=NORMAL;`)
  } catch (e) {
    console.error('[DB] PRAGMA init failed', e)
  }
}
initSqlitePragmas().catch(() => {})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
export default prisma