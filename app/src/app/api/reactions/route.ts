import { z } from 'zod'
import { requireSessionUser, isUnauthorizedError } from '@/features/auth/server/session'
import { reactionUpsertSchema } from '@/features/reactions/schemas'
import { clearReaction, setReactionStatus } from '@/features/reactions/server/commands'
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

// DELETE /api/reactions?workId=...
// Annule un swipe : efface la réaction → l'œuvre revient dans le deck Discover.
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const parsed = z.object({ workId: z.string().min(1) }).safeParse({ workId: url.searchParams.get('workId') })
    if (!parsed.success) return jsonError('invalid_query', 400, parsed.error.flatten())

    const sessionUser = await requireSessionUser()
    await clearReaction({ userId: sessionUser.id, workId: parsed.data.workId })

    return jsonOk({ cleared: true }, 200)
  } catch (e: unknown) {
    if (isUnauthorizedError(e)) return jsonError('unauthorized', 401)
    return jsonError('server_error', 500)
  }
}
