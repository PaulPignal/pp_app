import { requireSessionUser, isUnauthorizedError } from '@/features/auth/server/session'
import { reactionUpsertSchema } from '@/features/reactions/schemas'
import { setReactionStatus } from '@/features/reactions/server/commands'
import { jsonError, jsonOk } from '@/shared/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = reactionUpsertSchema.safeParse(body)
    if (!parsed.success) return jsonError('invalid_body', 400, parsed.error.flatten())

    const sessionUser = await requireSessionUser()
    const { reaction } = await setReactionStatus({
      userId: sessionUser.id,
      workId: parsed.data.workId,
      status: parsed.data.status,
    })

    return jsonOk({ reaction }, 200)
  } catch (e: unknown) {
    if (isUnauthorizedError(e)) return jsonError('unauthorized', 401)
    return jsonError('server_error', 500)
  }
}
