import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { env, isProduction } from '@/server/env'

type GlobalPrisma = typeof globalThis & { prisma?: PrismaClient }

const globalForPrisma = globalThis as GlobalPrisma
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['warn', 'error'],
  })

if (!isProduction) {
  globalForPrisma.prisma = prisma
}

export default prisma
