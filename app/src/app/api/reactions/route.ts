import { requireSessionUser } from '@/features/auth/server/session'
import { reactionUpsertSchema, reactionWorkQuerySchema } from '@/features/reactions/schemas'
import { clearReaction, setReactionStatus } from '@/features/reactions/server/commands'
import { jsonError, jsonKnownError, jsonOk } from '@/shared/lib/http'
import { rateLimit } from '@/shared/lib/rate-limit'

// Un swipe humain dépasse rarement 1 par seconde : 120/min borne un script qui like tout le catalogue.
const REACTIONS_PER_MINUTE = 120

export async function POST(req: Request) {
  try {
    const parsed = reactionUpsertSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError('invalid_body', 400)

    const sessionUser = await requireSessionUser()
    if (!rateLimit(`reactions:${sessionUser.id}`, REACTIONS_PER_MINUTE, 60_000).ok) return jsonError('rate_limited', 429)

    const { reaction } = await setReactionStatus({ userId: sessionUser.id, ...parsed.data })
    return jsonOk({ reaction })
  } catch (error) {
    return jsonKnownError(error, { unauthorized: 401 }, 'POST /api/reactions')
  }
}

// DELETE /api/reactions?workId=... : annule un swipe, l'œuvre revient dans le deck Discover.
export async function DELETE(req: Request) {
  try {
    const parsed = reactionWorkQuerySchema.safeParse({ workId: new URL(req.url).searchParams.get('workId') })
    if (!parsed.success) return jsonError('invalid_query', 400)

    const sessionUser = await requireSessionUser()
    if (!rateLimit(`reactions:${sessionUser.id}`, REACTIONS_PER_MINUTE, 60_000).ok) return jsonError('rate_limited', 429)

    await clearReaction({ userId: sessionUser.id, workId: parsed.data.workId })
    return jsonOk({ cleared: true })
  } catch (error) {
    return jsonKnownError(error, { unauthorized: 401 }, 'DELETE /api/reactions')
  }
}
