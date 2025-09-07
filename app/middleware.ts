export { default } from "next-auth/middleware"

export const config = {
  matcher: [
    "/",              // page d'accueil
    "/discover/:path*",
    "/likes/:path*",
    "/new/:path*",
    "/friends/:path*",
  ],
}
