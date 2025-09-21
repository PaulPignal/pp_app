// src/app/discover/page.tsx
import SwipeDeck from '@/components/SwipeDeck'
import { Metadata } from 'next'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import type { Work } from '@/types/Work'

export const metadata: Metadata = {
  title: 'Découvertes',
  description: 'Parcours de découvertes à swiper façon Tinder',
}

// 🔄 important pour éviter tout cache et re-rendre selon la session
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

async function getWorks(): Promise<Work[]> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const res = await fetch(`${base}/api/works?per=200`, { cache: 'no-store' })
  if (!res.ok) return []
  const j = await res.json().catch(() => ({ items: [] }))
  return Array.isArray(j?.items) ? (j.items as Work[]) : []
}

export default async function DiscoverPage() {
  // 1) Session -> protéger la page
  const session = await auth()
  if (!session?.user?.email) redirect('/signin')

  // 2) Charger un lot généreux (200) depuis l’API user-aware
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