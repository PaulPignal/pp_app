import { registerUser } from '@/features/auth/server/commands'
import { registerUserSchema } from '@/features/auth/schemas'
import { jsonError, jsonKnownError, jsonOk } from '@/shared/lib/http'
import { clientIp, rateLimit } from '@/shared/lib/rate-limit'

export async function POST(req: Request) {
  try {
    if (!rateLimit(`register:${clientIp(req)}`, 5, 60_000).ok) return jsonError('rate_limited', 429)

    const parsed = registerUserSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return jsonError('invalid_body', 400)

    const user = await registerUser(parsed.data)
    return jsonOk({ user }, 201)
  } catch (error) {
    return jsonKnownError(error, { email_exists: 409 }, 'POST /api/register')
  }
}
