import { getToken } from 'next-auth/jwt'
import { NextResponse, type NextRequest } from 'next/server'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

// Middleware Next 16 (convention `proxy.ts`). Protège au edge : redirige les
// requêtes non authentifiées AVANT le rendu de la page (307 propre + callbackUrl),
// au lieu de laisser une page `force-dynamic` faire une redirection meta-refresh.
// Les gardes in-page (requireSessionUserOrRedirect) restent en défense de second rideau.
// `/` et `/discover` sont publics : on swipe sans compte, le 1er like propose l'inscription.

export default async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) {
    const url = req.nextUrl.clone()
    url.pathname = SIGN_IN_PATH
    // Chemin + requête : un lien d'invitation (/friends?token=…) survit à la connexion.
    url.search = ''
    url.searchParams.set('callbackUrl', `${req.nextUrl.pathname}${req.nextUrl.search}`)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/likes/:path*', '/friends/:path*'],
}
