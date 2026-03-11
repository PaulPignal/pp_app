// src/app/api/works/route.ts
import { NextResponse } from 'next/server'
import type { Prisma } from '@/generated/prisma/client'
import { getPrisma } from '@/lib/prisma'
import { auth } from '@/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(req: Request) {
  try {
    const prisma = await getPrisma()
    const url = new URL(req.url)

    const per = Math.min(Math.max(parseInt(url.searchParams.get('per') || '100', 10), 1), 200)

    const where: Prisma.WorkWhereInput = {}
    const since = url.searchParams.get('since')
    if (since) {
      const d = new Date(since)
      if (!isNaN(d.getTime())) where.createdAt = { gte: d }
    }

    // 🔐 Exclure toute Reaction (LIKE/DISLIKE/SEEN) du user courant
    const session = await auth()
    const email = session?.user?.email ?? null
    if (email) {
      const me = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (me) {
        where.reactions = { none: { userId: me.id } }
      }
    }

    const [total, items] = await Promise.all([
      prisma.work.count({ where }),
      prisma.work.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: per,
        select: {
          id: true,
          title: true,
          imageUrl: true,
          category: true,
          venue: true,
          startDate: true,
          endDate: true,
          priceMin: true,
          priceMax: true,
          sourceUrl: true,
        },
      }),
    ])

    return NextResponse.json({ total, items }, { status: 200 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
