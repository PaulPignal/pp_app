import { requireSessionUser, isUnauthorizedError } from '@/features/auth/server/session'
import { friendRequestActionSchema } from '@/features/friendships/schemas'
import { acceptFriendRequest, declineFriendRequest } from '@/features/friendships/server/commands'
import { jsonError, jsonOk } from '@/shared/lib/http'
import { rateLimit } from '@/shared/lib/rate-limit'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// POST /api/friends/requests — accepter ou refuser une demande reçue.
export async function POST(req: Request) {
  try {
    const sessionUser = await requireSessionUser()

    const limit = rateLimit(`friends:${sessionUser.id}`, 30, 60_000)
    if (!limit.ok) return jsonError('rate_limited', 429)

    const body = await req.json().catch(() => null)
    const parsed = friendRequestActionSchema.safeParse(body)

    if (!parsed.success) {
      return jsonError('invalid_friend_input', 400, parsed.error.flatten())
    }

    if (parsed.data.action === 'accept') {
      const friend = await acceptFriendRequest({ userId: sessionUser.id, requesterId: parsed.data.requesterId })
      return jsonOk({ friend })
    }

    await declineFriendRequest({ userId: sessionUser.id, requesterId: parsed.data.requesterId })
    return jsonOk({ declined: true })
  } catch (error) {
    if (isUnauthorizedError(error)) return jsonError('unauthorized', 401)
    if (error instanceof Error) {
      const status = error.message === 'request_not_found' ? 404 : 400
      return jsonError(error.message, status)
    }
    return jsonError('server_error', 500)
  }
}
