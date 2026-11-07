import { requireSessionUser } from '@/features/auth/server/session'
import { listCommonLikedWorks } from '@/features/common/server/queries'
import { commonQuerySchema } from '@/features/common/schemas'
import { jsonError, jsonKnownError, jsonOk } from '@/shared/lib/http'

// GET /api/common?friendId=... : œuvres likées par l'utilisateur ET par cet ami.
export async function GET(req: Request) {
  try {
    const sessionUser = await requireSessionUser()
    const parsed = commonQuerySchema.safeParse({ friendId: new URL(req.url).searchParams.get('friendId') })
    if (!parsed.success) return jsonError('invalid_query', 400)

    const works = await listCommonLikedWorks(sessionUser.id, parsed.data.friendId)
    return jsonOk({ works })
  } catch (error) {
    return jsonKnownError(error, { unauthorized: 401, forbidden: 403 }, 'GET /api/common')
  }
}
