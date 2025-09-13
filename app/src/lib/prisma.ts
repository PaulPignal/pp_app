// src/lib/prisma.ts
export async function getPrisma() {
  const { prisma } = await import('@/server/db')
  return prisma
}