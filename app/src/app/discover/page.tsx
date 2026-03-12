import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/features/auth/server/session'
import { DEFAULT_WORK_SECTION, WORK_SECTION_VALUES, type WorkSection } from '@/features/works/section'
import { listDiscoverWorks } from '@/features/works/server/queries'
import SwipeDeck from '@/features/works/ui/SwipeDeck'
import { SIGN_IN_PATH } from '@/shared/lib/routes'
import PageHeader from '@/shared/ui/PageHeader'
import SegmentedControl from '@/shared/ui/SegmentedControl'

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

export default async function DiscoverPage({ searchParams }: DiscoverPageProps = {}) {
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
    <div className="page-shell">
      <PageHeader
        eyebrow="Découverte"
        title="Découvertes"
        description="Balaye à droite pour enregistrer un like, à gauche pour passer. Le clavier reste actif avec ← et → pour garder un rythme rapide."
        meta={
          <>
            <span className="chip">{works.total} propositions disponibles</span>
            <span className="chip">Deck mobile-first</span>
          </>
        }
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            ariaLabel="Sections culturelles"
            value={section}
            items={[
              { label: 'Théâtre', value: 'theatre', href: '/discover?section=theatre' },
              { label: 'Cinéma', value: 'cinema', href: '/discover?section=cinema' },
            ]}
          />
          <p className="text-sm leading-6 text-muted-foreground">
            Un seul objet à lire à la fois, avec les informations utiles directement sur la carte.
          </p>
        </div>
      </PageHeader>

      <SwipeDeck items={works.items} totalCount={works.total} />
    </div>
  )
}
