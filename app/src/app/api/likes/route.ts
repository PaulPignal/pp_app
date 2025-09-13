import { getPrisma } from '@/lib/prisma'
import { jsonOk, jsonError, requireAuthUserId } from '@/lib/http'
import { LikeCreateSchema, LikeDeleteQuerySchema } from '@/lib/validators'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const prisma = await getPrisma()
    const userId = await requireAuthUserId()
    const likes = await prisma.like.findMany({
      where: { userId },
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

export async function POST(req: Request) {
  try {
    const prisma = await getPrisma()
    const userId = await requireAuthUserId()
    const body = await req.json().catch(() => ({}))
    const parsed = LikeCreateSchema.safeParse(body)
    if (!parsed.success) return jsonError('invalid_body', 400, parsed.error.flatten())
    const { workId } = parsed.data

    // Idempotent: crée si absent, sinon ne modifie rien
    const like = await prisma.like.upsert({
      where: { userId_workId: { userId, workId } },
      update: {},                 // déjà liké -> ne change rien
      create: { userId, workId }, // pas encore liké -> crée
    })

    // 200 au lieu de 201 pour l'idempotence (même résultat si existant)
    return jsonOk({ like, alreadyExisted: false }, 200)
  } catch (e: any) {
    // En théorie on ne devrait plus tomber ici pour doublon, mais on garde un filet
    if (e?.code === 'P2002') return jsonOk({ alreadyExisted: true }, 200)
    if (e instanceof Response) return e
    console.error('[POST /api/likes] error:', e)
    return jsonError('server_error', 500)
  }
}

export async function DELETE(req: Request) {
  try {
    const prisma = await getPrisma()
    const userId = await requireAuthUserId()
    const url = new URL(req.url)
    const parsed = LikeDeleteQuerySchema.safeParse({ workId: url.searchParams.get('workId') })
    if (!parsed.success) return jsonError('invalid_query', 400, parsed.error.flatten())

    await prisma.like.delete({
      where: { userId_workId: { userId, workId: parsed.data.workId } },
    })
    return jsonOk({ deleted: true })
  } catch (e: any) {
    if (e instanceof Response) return e
    console.error('[DELETE /api/likes] error:', e)
    return jsonError('server_error', 500)
  }
}