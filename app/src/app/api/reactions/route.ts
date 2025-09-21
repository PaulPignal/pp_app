// src/app/api/reactions/route.ts
import { getPrisma } from '@/lib/prisma'
import { jsonOk, jsonError, requireAuthUserId } from '@/lib/http'
import { ReactionUpsertSchema } from '@/lib/validators'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(req: Request) {
  try {
    const prisma = await getPrisma()
    const userId = await requireAuthUserId()
    const body = await req.json().catch(() => ({}))
    const parsed = ReactionUpsertSchema.safeParse(body)
    if (!parsed.success) return jsonError('invalid_body', 400, parsed.error.flatten())
    const { workId, status } = parsed.data

    const reaction = await prisma.reaction.upsert({
      where: { userId_workId: { userId, workId } },
      update: { status },
      create: { userId, workId, status },
    })
    return jsonOk({ reaction }, 200)
  } catch (e: any) {
    if (e instanceof Response) return e
    return jsonError('server_error', 500)
  }
}