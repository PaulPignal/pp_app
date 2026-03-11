import { z } from 'zod'
import { requireSessionUser, isUnauthorizedError } from '@/features/auth/server/session'
import { legacyLikeSchema, reactionUpsertSchema } from '@/features/reactions/schemas'
import { setReactionStatus } from '@/features/reactions/server/commands'
import { listLikedWorks } from '@/features/reactions/server/queries'
import { jsonError, jsonOk } from '@/shared/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// GET /api/likes
// -> Liste des reactions LIKE de l'utilisateur, avec la Work incluse
export async function GET() {
  try {
    const sessionUser = await requireSessionUser()
    const likes = await listLikedWorks(sessionUser.id)
    return jsonOk({ likes })
  } catch (e: unknown) {
    if (isUnauthorizedError(e)) return jsonError('unauthorized', 401)
    console.error('[GET /api/likes] error:', e)
    return jsonError('server_error', 500)
  }
}

// POST /api/likes
// Compat ascendante : accepte soit { workId } (ancien), soit { workId, status: 'LIKE' } (nouveau)
export async function POST(req: Request) {
  try {
    const sessionUser = await requireSessionUser()
    const body = await req.json().catch(() => null)

    const parsedNew = reactionUpsertSchema.safeParse(body)
    let workId: string | null = null

    if (parsedNew.success) {
      workId = parsedNew.data.workId
    } else {
      const parsedOld = legacyLikeSchema.safeParse(body)
      if (!parsedOld.success) {
        return jsonError('invalid_body', 400, parsedNew.error?.flatten?.() ?? parsedOld.error.flatten())
      }
      workId = parsedOld.data.workId
    }

    const result = await setReactionStatus({
      userId: sessionUser.id,
      workId,
      status: 'LIKE',
    })

    return jsonOk({ reaction: result.reaction, alreadyExisted: result.alreadyExisted }, 200)
  } catch (e: unknown) {
    if (isUnauthorizedError(e)) return jsonError('unauthorized', 401)
    console.error('[POST /api/likes] error:', e)
    return jsonError('server_error', 500)
  }
}

// DELETE /api/likes?workId=...
// Compat ascendante : "Retirer" => on marque la Reaction en DISLIKE (au lieu de delete)
export async function DELETE(req: Request) {
  try {
    const sessionUser = await requireSessionUser()
    const url = new URL(req.url)

    const DeleteQuerySchema = z.object({ workId: z.string().min(1) })
    const parsed = DeleteQuerySchema.safeParse({ workId: url.searchParams.get('workId') })
    if (!parsed.success) return jsonError('invalid_query', 400, parsed.error.flatten())

    const { workId } = parsed.data

    await setReactionStatus({
      userId: sessionUser.id,
      workId,
      status: 'DISLIKE',
    })

    return jsonOk({ disliked: true })
  } catch (e: unknown) {
    if (isUnauthorizedError(e)) return jsonError('unauthorized', 401)
    console.error('[DELETE /api/likes] error:', e)
    return jsonError('server_error', 500)
  }
}
