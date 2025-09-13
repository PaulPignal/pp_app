// src/app/discover/page.tsx
import SwipeDeck from '@/components/SwipeDeck'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Découvertes',
  description: 'Parcours de découvertes à swiper façon Tinder',
}

async function getWorks() {
  try {
    // Import dynamique pour éviter les erreurs de build
    const { prisma } = await import('@/server/db')
    
    return await prisma.work.findMany({
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
  } catch (error) {
    console.error('Error fetching works:', error)
    return []
  }
}

export default async function DiscoverPage() {
  const works = await getWorks()

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