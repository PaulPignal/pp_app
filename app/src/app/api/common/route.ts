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

    const common = await prisma.reaction.findMany({
      where: {
        status: 'LIKE',
        userId: { in: [meId, friendId] },
      },
      orderBy: { createdAt: 'desc' },
      include: { work: true },
    })

    return jsonOk({ common })
  } catch (e: any) {
    if (e instanceof Response) return e
    console.error('[GET /api/common] error:', e)
    return jsonError('server_error', 500)
  }
}