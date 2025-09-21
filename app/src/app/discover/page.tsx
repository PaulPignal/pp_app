// src/app/discover/page.tsx
import SwipeDeck from '@/components/SwipeDeck'
import { Metadata } from 'next'
import { auth } from '@/auth'
import { prisma } from '@/server/db'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Découvertes',
  description: 'Parcours de découvertes à swiper façon Tinder',
}

// 🔄 important pour éviter tout cache et re-rendre selon la session
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function DiscoverPage() {
  // 1) Session -> utilisateur
  const session = await auth()
  if (!session?.user?.email) {
    redirect('/signin')
  }
  const me = await prisma.user.findUnique({
    where: { email: session.user!.email! },
    select: { id: true },
  })
  if (!me) redirect('/signin')

  // 2) Charger TOUTES les œuvres non encore likées par l’utilisateur
  // Option A (si la relation Work.likes existe dans le schéma Prisma) :
  // const works = await prisma.work.findMany({
  //   where: { likes: { none: { userId: me.id } } },
  //   orderBy: { createdAt: 'desc' },
  //   select: {
  //     id: true, title: true, imageUrl: true, category: true, venue: true,
  //     startDate: true, endDate: true, priceMin: true, priceMax: true, sourceUrl: true,
  //   },
  // })

  // Option B (100% compatible) : exclusion par NOT IN
  const liked = await prisma.like.findMany({
    where: { userId: me.id },
    select: { workId: true },
  })
  const likedIds = liked.map(l => l.workId)

  const works = await prisma.work.findMany({
    where: likedIds.length ? { id: { notIn: likedIds } } : undefined,
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