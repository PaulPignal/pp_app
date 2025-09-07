import { auth } from '@/auth'

export async function GET() {
  const session = await auth()
  return new Response(JSON.stringify({ session }, null, 2), {
    headers: { 'content-type': 'application/json' },
  })
}
