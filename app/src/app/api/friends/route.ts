import { requireSessionUser, isUnauthorizedError } from '@/features/auth/server/session'
import { addFriendSchema } from '@/features/friendships/schemas'
import { addFriend } from '@/features/friendships/server/commands'
import { createInviteToken } from '@/features/friendships/server/invite'
import { listFriends } from '@/features/friendships/server/queries'
import { jsonError, jsonOk } from '@/shared/lib/http'

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

    const friends = await listFriends(sessionUser.id)
    return jsonOk({ friends })
  } catch (error) {
    if (isUnauthorizedError(error)) return jsonError('unauthorized', 401)
    return jsonError('server_error', 500)
  }
}

export async function POST(req: Request) {
  try {
    const sessionUser = await requireSessionUser()
    const body = await req.json().catch(() => null)
    const parsed = addFriendSchema.safeParse(body)

    if (!parsed.success) {
      return jsonError('invalid_friend_input', 400, parsed.error.flatten())
    }

    const friend = await addFriend({
      userId: sessionUser.id,
      userEmail: sessionUser.email,
      input: parsed.data,
    })

    return jsonOk({ friend }, 200)
  } catch (error) {
    if (isUnauthorizedError(error)) return jsonError('unauthorized', 401)
    if (error instanceof Error) {
      const status = error.message === 'friend_not_found' ? 404 : 400
      return jsonError(error.message, status)
    }
    return jsonError('server_error', 500)
  }
}
