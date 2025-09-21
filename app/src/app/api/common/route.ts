// src/app/api/common/route.ts
import { getPrisma } from '@/lib/prisma'
import { jsonOk, jsonError, requireAuthUserId } from '@/lib/http'
import { CommonQuerySchema } from '@/lib/validators'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Helper: retourne le delegate Reaction si présent (nouveau schéma), sinon undefined
function getReactionDelegate(prisma: any):
  | { findMany: Function }
  | undefined {
  return prisma?.reaction && typeof prisma.reaction === 'object' ? prisma.reaction : undefined
}

// GET /api/common?friendId=...
// Renvoie les LIKE des deux utilisateurs (toi + friendId), avec la Work incluse.
// (Même forme de réponse qu'avant, mais basée sur Reaction.)
export async function GET(req: Request) {
  try {
    const prisma = await getPrisma()
    const userId = await requireAuthUserId()

    const url = new URL(req.url)
    const parsed = CommonQuerySchema.safeParse({ friendId: url.searchParams.get('friendId') })
    if (!parsed.success) return jsonError('invalid_query', 400, parsed.error.flatten())

    const friendId = parsed.data.friendId

    const reaction = getReactionDelegate(prisma as any)
    if (reaction) {
      // Nouveau schéma : LIKEs pour [userId, friendId]
      const common = await reaction.findMany({
        where: { userId: { in: [userId, friendId] }, status: 'LIKE' },
        orderBy: { createdAt: 'desc' },
        include: { work: true },
      })
      return jsonOk({ common })
    }

    // Fallback legacy (ancien schéma) : table Like
    const common = await prisma.like.findMany({
      where: { userId: { in: [userId, friendId] } },
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