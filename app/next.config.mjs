import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const isProd = process.env.NODE_ENV === 'production'

// En dev, Next/HMR a besoin de 'unsafe-eval'. On le retire en production.
const scriptSrc = isProd ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'"

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://*.offi.fr data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Loader custom : les images offi sont servies directement par offi (à la bonne
    // taille hébergée), sans passer par l'optimiseur Vercel (évite le quota d'Image
    // Optimization qui cassait les images en preview/prod).
    loader: 'custom',
    loaderFile: './image-loader.ts',
    remotePatterns: [
      { protocol: 'https', hostname: 'files.offi.fr' },
      { protocol: 'https', hostname: 'images.offi.fr' },
      { protocol: 'https', hostname: 'www.offi.fr' },
    ],
  },
  env: {
    NEXT_PUBLIC_SIGNIN_PATH: "/signin",
  },
  turbopack: {
    root: __dirname,
  },
  reactStrictMode: true, // optionnel mais recommandé
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
