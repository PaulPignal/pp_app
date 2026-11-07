import { requireSessionUser } from '@/features/auth/server/session'
import { friendRequestActionSchema } from '@/features/friendships/schemas'
import { acceptFriendRequest, declineFriendRequest } from '@/features/friendships/server/commands'
import { jsonError, jsonKnownError, jsonOk } from '@/shared/lib/http'
import { rateLimit } from '@/shared/lib/rate-limit'

// POST /api/friends/requests : accepter ou refuser une demande reçue.
export async function POST(req: Request) {
  try {
    const sessionUser = await requireSessionUser()
    if (!rateLimit(`friends:${sessionUser.id}`, 30, 60_000).ok) return jsonError('rate_limited', 429)

    const parsed = friendRequestActionSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError('invalid_friend_input', 400)

    const { requesterId, action } = parsed.data
    if (action === 'accept') {
      const friend = await acceptFriendRequest({ userId: sessionUser.id, requesterId })
      return jsonOk({ friend })
    }

    await declineFriendRequest({ userId: sessionUser.id, requesterId })
    return jsonOk({ declined: true })
  } catch (error) {
    return jsonKnownError(error, { unauthorized: 401, request_not_found: 404 }, 'POST /api/friends/requests')
  }
}
