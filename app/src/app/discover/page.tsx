import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/features/auth/server/session'
import { listDiscoverWorks } from '@/features/works/server/queries'
import SwipeDeck from '@/features/works/ui/SwipeDeck'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

export const metadata: Metadata = {
  title: 'Découvertes',
  description: 'Parcours de découvertes à swiper façon Tinder',
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function DiscoverPage() {
  let sessionUser
  try {
    sessionUser = await requireSessionUser()
  } catch {
    redirect(SIGN_IN_PATH)
  }

  const works = await listDiscoverWorks({ userId: sessionUser.id, per: 200 })

  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-3">
        <h1 className="text-2xl font-semibold">Découvertes</h1>
        <p className="text-sm text-muted-foreground">
          Balaye à droite pour « Like », à gauche pour « Pass ». Flèches ← / → au clavier.
        </p>
      </header>
      <SwipeDeck items={works.items} />
    </main>
  )
}
