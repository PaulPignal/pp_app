import { Metadata } from 'next'
import { requireSessionUserOrRedirect } from '@/features/auth/server/session'
import { DEFAULT_WORK_SECTION, WORK_SECTION_LABELS, WORK_SECTION_VALUES, type WorkSection } from '@/features/works/section'
import { listDiscoverWorks, listStreamingPlatforms } from '@/features/works/server/queries'
import SwipeDeck from '@/features/works/ui/SwipeDeck'
import StreamingPlatformFilter from '@/features/works/ui/StreamingPlatformFilter'
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
    platforms?: string | string[]
  }>
}

function resolveSection(value: string | string[] | undefined): WorkSection {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate && WORK_SECTION_VALUES.includes(candidate as WorkSection) ? (candidate as WorkSection) : DEFAULT_WORK_SECTION
}

function resolvePlatforms(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : (value ?? '')
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default async function DiscoverPage({ searchParams }: DiscoverPageProps = {}) {
  const sessionUser = await requireSessionUserOrRedirect()

  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const section = resolveSection(resolvedSearchParams?.section)
  const isStreaming = section === 'streaming'
  // Le filtre plateformes ne s'applique que sur l'onglet streaming.
  const selectedPlatforms = isStreaming ? resolvePlatforms(resolvedSearchParams?.platforms) : []

  const [works, availablePlatforms] = await Promise.all([
    listDiscoverWorks({
      userId: sessionUser.id,
      per: 200,
      section,
      platforms: selectedPlatforms.length ? selectedPlatforms : undefined,
    }),
    isStreaming ? listStreamingPlatforms() : Promise.resolve([]),
  ])

  return (
    <div className="page-shell">
      <h1 className="sr-only">Découvertes — sorties à Paris et films en streaming</h1>
      <SegmentedControl
        ariaLabel="Sections culturelles"
        value={section}
        scroll
        items={WORK_SECTION_VALUES.map((s) => ({
          label: WORK_SECTION_LABELS[s],
          value: s,
          href: `/discover?section=${s}`,
        }))}
      />

      {isStreaming ? <StreamingPlatformFilter available={availablePlatforms} selected={selectedPlatforms} /> : null}

      <SwipeDeck items={works.items} totalCount={works.total} />
    </div>
  )
}
