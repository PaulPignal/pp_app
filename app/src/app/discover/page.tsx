import { Metadata } from 'next'
import { requireSessionUserOrRedirect } from '@/features/auth/server/session'
import { DEFAULT_WORK_SECTION, WORK_SECTION_VALUES, type WorkSection } from '@/features/works/section'
import { listDiscoverWorks } from '@/features/works/server/queries'
import SwipeDeck from '@/features/works/ui/SwipeDeck'
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
  const sessionUser = await requireSessionUserOrRedirect()

  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const section = resolveSection(resolvedSearchParams?.section)
  const works = await listDiscoverWorks({ userId: sessionUser.id, per: 200, section })

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="Découverte"
        title="Découvertes"
        description="Théâtre et cinéma à Paris, une carte à la fois."
        meta={<span className="chip">{works.total} à découvrir</span>}
      >
        <SegmentedControl
          ariaLabel="Sections culturelles"
          value={section}
          items={[
            { label: 'Théâtre', value: 'theatre', href: '/discover?section=theatre' },
            { label: 'Cinéma', value: 'cinema', href: '/discover?section=cinema' },
          ]}
        />
      </PageHeader>

      <SwipeDeck items={works.items} totalCount={works.total} />
    </div>
  )
}
