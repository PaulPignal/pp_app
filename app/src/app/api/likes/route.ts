// src/app/api/likes/route.ts
import { getPrisma } from '@/lib/prisma'
import { jsonOk, jsonError, requireAuthUserId } from '@/lib/http'
import { ReactionUpsertSchema } from '@/lib/validators'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// GET /api/likes
// -> Liste des reactions LIKE de l'utilisateur, avec la Work incluse
export async function GET() {
  try {
    const prisma = await getPrisma()
    const userId = await requireAuthUserId()
    const likes = await prisma.reaction.findMany({
      where: { userId, status: 'LIKE' },
      orderBy: { createdAt: 'desc' },
      include: { work: true },
    })
    return jsonOk({ likes })
  } catch (e: any) {
    if (e instanceof Response) return e
    console.error('[GET /api/likes] error:', e)
    return jsonError('server_error', 500)
  }
}

// POST /api/likes
// Compat ascendante : accepte soit { workId } (ancien), soit { workId, status: 'LIKE' } (nouveau)
export async function POST(req: Request) {
  try {
    const prisma = await getPrisma()
    const userId = await requireAuthUserId()
    const body = await req.json().catch(() => ({} as any))

    // Essaye le nouveau schéma
    const parsedNew = ReactionUpsertSchema.safeParse(body)
    let workId: string | null = null

    if (parsedNew.success) {
      workId = parsedNew.data.workId
      // on force LIKE ici (même si body.status est fourni, ce endpoint ne gère que LIKE)
    } else {
      // Legacy: body = { workId }
      const LegacyLikeSchema = z.object({ workId: z.string().min(1) })
      const parsedOld = LegacyLikeSchema.safeParse(body)
      if (!parsedOld.success) {
        return jsonError('invalid_body', 400, parsedNew.error?.flatten?.() ?? parsedOld.error.flatten())
      }
      workId = parsedOld.data.workId
    }

    // Savoir si une reaction existait déjà (pour "alreadyExisted")
    const prev = await prisma.reaction.findUnique({
      where: { userId_workId: { userId, workId } },
      select: { status: true },
    })

    const like = await prisma.reaction.upsert({
      where: { userId_workId: { userId, workId } },
      update: { status: 'LIKE' },
      create: { userId, workId, status: 'LIKE' },
    })

    const alreadyExisted = !!prev && prev.status === 'LIKE'
    return jsonOk({ like, alreadyExisted }, 200)
  } catch (e: any) {
    if (e instanceof Response) return e
    console.error('[POST /api/likes] error:', e)
    return jsonError('server_error', 500)
  }
}

// DELETE /api/likes?workId=...
// Compat ascendante : "Retirer" => on marque la Reaction en DISLIKE (au lieu de delete)
export async function DELETE(req: Request) {
  try {
    const prisma = await getPrisma()
    const userId = await requireAuthUserId()
    const url = new URL(req.url)

    const DeleteQuerySchema = z.object({ workId: z.string().min(1) })
    const parsed = DeleteQuerySchema.safeParse({ workId: url.searchParams.get('workId') })
    if (!parsed.success) return jsonError('invalid_query', 400, parsed.error.flatten())

    const { workId } = parsed.data

    await prisma.reaction.upsert({
      where: { userId_workId: { userId, workId } },
      update: { status: 'DISLIKE' },
      create: { userId, workId, status: 'DISLIKE' },
    })

    return jsonOk({ disliked: true })
  } catch (e: any) {
    if (e instanceof Response) return e
    console.error('[DELETE /api/likes] error:', e)
    return jsonError('server_error', 500)
  }
}