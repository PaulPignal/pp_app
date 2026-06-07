// src/app/api/register/route.ts
import { registerUser } from '@/features/auth/server/commands'
import { registerUserSchema } from '@/features/auth/schemas'
import { jsonError, jsonOk } from '@/shared/lib/http'
import { clientIp, rateLimit } from '@/shared/lib/rate-limit'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function POST(req: Request) {
  try {
    const limit = rateLimit(`register:${clientIp(req)}`, 5, 60_000)
    if (!limit.ok) return jsonError('rate_limited', 429)

    const body = await req.json().catch(() => null)
    const parsed = registerUserSchema.safeParse(body)

    if (!parsed.success) {
      return jsonError('invalid_body', 400, parsed.error.flatten())
    }

    const user = await registerUser(parsed.data)
    return jsonOk({ user }, 201)
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'email_exists') {
      return jsonError('email_exists', 409)
    }
    console.error('[POST /api/register] error:', e)
    return jsonError('server_error', 500)
  }
}
