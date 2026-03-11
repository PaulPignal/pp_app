import { getSessionUser } from '@/features/auth/server/session'
import { listDiscoverWorksParamsSchema } from '@/features/works/schemas'
import { listDiscoverWorks } from '@/features/works/server/queries'
import { jsonError, jsonOk } from '@/shared/lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const parsed = listDiscoverWorksParamsSchema.safeParse({
      per: url.searchParams.get('per') ?? undefined,
      since: url.searchParams.get('since') ?? undefined,
      category: url.searchParams.get('category') ?? undefined,
    })

    if (!parsed.success) {
      return jsonError('invalid_query', 400, parsed.error.flatten())
    }

    const sessionUser = await getSessionUser()
    const result = await listDiscoverWorks({
      ...parsed.data,
      userId: sessionUser?.id ?? null,
    })

    return jsonOk(result, 200)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'server error'
    return jsonError(message, 500)
  }
}
