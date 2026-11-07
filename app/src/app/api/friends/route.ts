import { requireSessionUser } from '@/features/auth/server/session'
import { addFriendSchema, removeFriendSchema } from '@/features/friendships/schemas'
import { addFriend, removeFriend } from '@/features/friendships/server/commands'
import { jsonError, jsonKnownError, jsonOk } from '@/shared/lib/http'
import { rateLimit } from '@/shared/lib/rate-limit'

const ADD_FRIEND_ERRORS = { unauthorized: 401, cannot_add_self: 400, invalid_invite_token: 400, expired_invite_token: 400 }

export async function POST(req: Request) {
  try {
    const sessionUser = await requireSessionUser()
    if (!rateLimit(`friends:${sessionUser.id}`, 30, 60_000).ok) return jsonError('rate_limited', 429)

    const parsed = addFriendSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError('invalid_friend_input', 400)

    const result = await addFriend({ userId: sessionUser.id, userEmail: sessionUser.email, input: parsed.data })
    return jsonOk(result)
  } catch (error) {
    return jsonKnownError(error, ADD_FRIEND_ERRORS, 'POST /api/friends')
  }
}

export async function DELETE(req: Request) {
  try {
    const sessionUser = await requireSessionUser()
    if (!rateLimit(`friends:${sessionUser.id}`, 30, 60_000).ok) return jsonError('rate_limited', 429)

    const parsed = removeFriendSchema.safeParse({ friendId: new URL(req.url).searchParams.get('friendId') })
    if (!parsed.success) return jsonError('invalid_friend_input', 400)

    await removeFriend({ userId: sessionUser.id, friendId: parsed.data.friendId })
    return jsonOk({ removed: true })
  } catch (error) {
    return jsonKnownError(error, { unauthorized: 401 }, 'DELETE /api/friends')
  }
}
