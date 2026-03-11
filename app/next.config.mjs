import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
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
}

export default nextConfig
