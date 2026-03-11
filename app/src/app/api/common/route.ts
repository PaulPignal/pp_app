import { requireSessionUser, isUnauthorizedError } from '@/features/auth/server/session'
import { FriendshipForbiddenError, listCommonLikedWorks } from '@/features/common/server/queries'
import { commonQuerySchema } from '@/features/common/schemas'
import { jsonError, jsonOk } from '@/shared/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// GET /api/common?friendId=...
// Renvoie l'intersection des LIKE des deux utilisateurs (toi + friendId).
export async function GET(req: Request) {
  try {
    const sessionUser = await requireSessionUser()
    const url = new URL(req.url)
    const parsed = commonQuerySchema.safeParse({ friendId: url.searchParams.get('friendId') })
    if (!parsed.success) return jsonError('invalid_query', 400, parsed.error.flatten())

    const works = await listCommonLikedWorks(sessionUser.id, parsed.data.friendId)

    return jsonOk({ works })
  } catch (e: unknown) {
    if (isUnauthorizedError(e)) return jsonError('unauthorized', 401)
    if (e instanceof FriendshipForbiddenError) return jsonError('forbidden', 403)
    console.error('[GET /api/common] error:', e)
    return jsonError('server_error', 500)
  }
}
