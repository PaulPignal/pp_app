import { requireSessionUser, isUnauthorizedError } from '@/features/auth/server/session'
import { addFriendSchema, removeFriendSchema } from '@/features/friendships/schemas'
import { addFriend, removeFriend } from '@/features/friendships/server/commands'
import { createInviteToken } from '@/features/friendships/server/invite'
import { listFriends, listIncomingRequests } from '@/features/friendships/server/queries'
import { jsonError, jsonOk } from '@/shared/lib/http'
import { rateLimit } from '@/shared/lib/rate-limit'

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  try {
    const sessionUser = await requireSessionUser()
    const { searchParams } = new URL(req.url)

    if (searchParams.get('invite') === '1') {
      return jsonOk({ token: createInviteToken(sessionUser.id) })
    }

    const [friends, requests] = await Promise.all([
      listFriends(sessionUser.id),
      listIncomingRequests(sessionUser.id),
    ])
    return jsonOk({ friends, requests })
  } catch (error) {
    if (isUnauthorizedError(error)) return jsonError('unauthorized', 401)
    return jsonError('server_error', 500)
  }
}

export async function POST(req: Request) {
  try {
    const sessionUser = await requireSessionUser()

    const limit = rateLimit(`friends:${sessionUser.id}`, 30, 60_000)
    if (!limit.ok) return jsonError('rate_limited', 429)

    const body = await req.json().catch(() => null)
    const parsed = addFriendSchema.safeParse(body)

    if (!parsed.success) {
      return jsonError('invalid_friend_input', 400, parsed.error.flatten())
    }

    const result = await addFriend({
      userId: sessionUser.id,
      userEmail: sessionUser.email,
      input: parsed.data,
    })

    return jsonOk({ friend: result.friend, status: result.status }, 200)
  } catch (error) {
    if (isUnauthorizedError(error)) return jsonError('unauthorized', 401)
    if (error instanceof Error) {
      const status = error.message === 'friend_not_found' ? 404 : 400
      return jsonError(error.message, status)
    }
    return jsonError('server_error', 500)
  }
}

export async function DELETE(req: Request) {
  try {
    const sessionUser = await requireSessionUser()

    const limit = rateLimit(`friends:${sessionUser.id}`, 30, 60_000)
    if (!limit.ok) return jsonError('rate_limited', 429)

    const { searchParams } = new URL(req.url)
    const parsed = removeFriendSchema.safeParse({ friendId: searchParams.get('friendId') })

    if (!parsed.success) {
      return jsonError('invalid_friend_input', 400, parsed.error.flatten())
    }

    await removeFriend({ userId: sessionUser.id, friendId: parsed.data.friendId })
    return jsonOk({ removed: true })
  } catch (error) {
    if (isUnauthorizedError(error)) return jsonError('unauthorized', 401)
    return jsonError('server_error', 500)
  }
}
