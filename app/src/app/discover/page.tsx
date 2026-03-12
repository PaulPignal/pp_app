import Link from 'next/link'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/features/auth/server/session'
import { DEFAULT_WORK_SECTION, WORK_SECTION_VALUES, type WorkSection } from '@/features/works/section'
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

type DiscoverPageProps = {
  searchParams?: Promise<{
    section?: string | string[]
  }>
}

function resolveSection(value: string | string[] | undefined): WorkSection {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate && WORK_SECTION_VALUES.includes(candidate as WorkSection) ? (candidate as WorkSection) : DEFAULT_WORK_SECTION
}

export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  let sessionUser
  try {
    sessionUser = await requireSessionUser()
  } catch {
    redirect(SIGN_IN_PATH)
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const section = resolveSection(resolvedSearchParams?.section)
  const works = await listDiscoverWorks({ userId: sessionUser.id, per: 200, section })

  return (
    <main className="mx-auto max-w-2xl p-4">
      <header className="mb-3">
        <h1 className="text-2xl font-semibold">Découvertes</h1>
        <p className="text-sm text-muted-foreground">
          Balaye à droite pour « Like », à gauche pour « Pass ». Flèches ← / → au clavier.
        </p>
      </header>
      <nav className="mb-4 flex gap-2" aria-label="Sections culturelles">
        <Link
          href="/discover?section=theatre"
          className={`rounded-full border px-3 py-1 text-sm ${section === 'theatre' ? 'bg-black text-white' : 'bg-white'}`}
        >
          Théâtre
        </Link>
        <Link
          href="/discover?section=cinema"
          className={`rounded-full border px-3 py-1 text-sm ${section === 'cinema' ? 'bg-black text-white' : 'bg-white'}`}
        >
          Cinéma
        </Link>
      </nav>
      <SwipeDeck items={works.items} />
    </main>
  )
}
