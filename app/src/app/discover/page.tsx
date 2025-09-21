// src/app/discover/page.tsx
import SwipeDeck from '@/components/SwipeDeck'
import { Metadata } from 'next'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import type { Work } from '@/types/Work'

export const metadata: Metadata = {
  title: 'Découvertes',
  description: 'Parcours de découvertes à swiper façon Tinder',
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function getBaseUrl() {
  const pub = process.env.NEXT_PUBLIC_APP_URL
  if (pub) return pub.replace(/\/+$/, '')
  const authUrl = process.env.NEXTAUTH_URL
  if (authUrl) return authUrl.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel}`
  const h = headers()
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

async function getWorks(): Promise<Work[]> {
  const base = getBaseUrl()
  const cookieHeader = cookies().toString() // <<< IMPORTANT : forward la session
  const res = await fetch(`${base}/api/works?per=200`, {
    cache: 'no-store',
    headers: { cookie: cookieHeader },
  })
  if (!res.ok) return []
  const j = await res.json().catch(() => ({ items: [] }))
  return Array.isArray(j?.items) ? (j.items as Work[]) : []
}

export default async function DiscoverPage() {
  const session = await auth()
  if (!session?.user?.email) redirect('/signin')

  const works = await getWorks()

  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-3">
        <h1 className="text-2xl font-semibold">Découvertes</h1>
        <p className="text-sm text-muted-foreground">
          Balaye à droite pour « Like », à gauche pour « Pass ». Flèches ← / → au clavier.
        </p>
      </header>
      <SwipeDeck items={works} />
    </main>
  )
}