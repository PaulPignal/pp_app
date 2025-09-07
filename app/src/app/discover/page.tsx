// src/app/discover/page.tsx
import prisma from '@/server/db'
import SwipeDeck from '@/components/SwipeDeck'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Découvertes',
  description: 'Parcours de découvertes à swiper façon Tinder',
}

export default async function DiscoverPage() {
  const works = await prisma.work.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      imageUrl: true,
      category: true,
      venue: true,
      startDate: true,
      endDate: true,
      priceMin: true,
      priceMax: true,
      sourceUrl: true,
    },
  })

  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-3">
        <h1 className="text-2xl font-semibold">Découvertes</h1>
        <p className="text-sm text-muted-foreground">
          Balaye à droite pour « Like », à gauche pour « Pass ». Flèches ← / → au clavier.
        </p>
      </header>
      <SwipeDeck items={works as any} />
    </main>
  )
}
