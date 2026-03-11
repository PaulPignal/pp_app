// src/app/api/common/route.ts
import { getPrisma } from '@/lib/prisma'
import { jsonOk, jsonError, requireAuthUserId } from '@/lib/http'
import { CommonQuerySchema } from '@/lib/validators'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// GET /api/common?friendId=...
// Renvoie les LIKE des deux utilisateurs (toi + friendId), avec la Work incluse.
// (Union des likes des deux comptes ; si tu veux l'intersection, dis-le et je te file la variante.)
export async function GET(req: Request) {
  try {
    const prisma = await getPrisma()
    const meId = await requireAuthUserId()

    const url = new URL(req.url)
    const parsed = CommonQuerySchema.safeParse({ friendId: url.searchParams.get('friendId') })
    if (!parsed.success) return jsonError('invalid_query', 400, parsed.error.flatten())

    const friendId = parsed.data.friendId
    const friendship = await prisma.friendship.findUnique({
      where: { userId_friendId: { userId: meId, friendId } },
      select: { id: true },
    })
    if (!friendship) return jsonError('forbidden', 403)

    const reactions = await prisma.reaction.findMany({
      where: {
        status: 'LIKE',
        userId: { in: [meId, friendId] },
      },
      select: { userId: true, workId: true },
    })

    const counts = new Map<string, Set<string>>()
    for (const reaction of reactions) {
      const users = counts.get(reaction.workId) ?? new Set<string>()
      users.add(reaction.userId)
      counts.set(reaction.workId, users)
    }

    const commonIds = [...counts.entries()]
      .filter(([, users]) => users.has(meId) && users.has(friendId))
      .map(([workId]) => workId)

    if (commonIds.length === 0) {
      return jsonOk({ works: [] })
    }

    const works = await prisma.work.findMany({
      where: { id: { in: commonIds } },
      orderBy: { createdAt: 'desc' },
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
    })

    return jsonOk({ works })
  } catch (e: unknown) {
    if (e instanceof Response) return e
    console.error('[GET /api/common] error:', e)
    return jsonError('server_error', 500)
  }
}
