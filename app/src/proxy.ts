import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'

// Middleware Next 16 (convention `proxy.ts`). Protège au edge : redirige les
// requêtes non authentifiées AVANT le rendu de la page (307 propre + callbackUrl),
// au lieu de laisser une page `force-dynamic` faire une redirection meta-refresh.
// Les gardes in-page (requireSessionUserOrRedirect) restent en défense de second rideau.
const SIGN_IN_PATH = process.env.NEXT_PUBLIC_SIGNIN_PATH || '/signin'

export default async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) {
    const url = req.nextUrl.clone()
    url.pathname = SIGN_IN_PATH
    url.searchParams.set('callbackUrl', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/discover/:path*', '/likes/:path*', '/friends/:path*'],
}
