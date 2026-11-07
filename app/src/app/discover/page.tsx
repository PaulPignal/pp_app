import { Metadata } from 'next'
import { getSessionUser } from '@/features/auth/server/session'
import { DEFAULT_WORK_SECTION, WORK_SECTION_LABELS, WORK_SECTION_VALUES, type WorkSection } from '@/features/works/section'
import { listDiscoverWorks, listStreamingPlatforms } from '@/features/works/server/queries'
import SwipeDeck from '@/features/works/ui/SwipeDeck'
import StreamingPlatformFilter from '@/features/works/ui/StreamingPlatformFilter'
import SegmentedControl from '@/shared/ui/SegmentedControl'

export const metadata: Metadata = {
  title: 'Découverte',
  description: 'Sorties à Paris et films en streaming, à parcourir d’un geste.',
}

export const dynamic = 'force-dynamic'

// Taille de la pile envoyée au client. 50 cartes suffisent largement à une session
// (le deck propose de recharger à la fin) et allègent le HTML initial.
const DECK_SIZE = 50

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
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const section = resolveSection(resolvedSearchParams?.section)
  const isStreaming = section === 'streaming'
  // Le filtre plateformes ne s'applique que sur l'onglet streaming.
  const selectedPlatforms = isStreaming ? resolvePlatforms(resolvedSearchParams?.platforms) : []

  // Découverte est PUBLIQUE : on peut swiper sans compte, le 1er like propose l'inscription.
  // userId nul = aucun filtre « déjà réagi ». En parallèle : la liste des plateformes (en
  // cache) est requise AVANT la requête works, car le streaming non filtré requête
  // « hasSome: toutes les plateformes » (index GIN) plutôt que « isEmpty:false » (scan).
  const [sessionUser, availablePlatforms] = await Promise.all([
    getSessionUser(),
    isStreaming ? listStreamingPlatforms() : Promise.resolve([] as string[]),
  ])
  const platformsForQuery = selectedPlatforms.length
    ? selectedPlatforms
    : isStreaming && availablePlatforms.length
      ? availablePlatforms
      : undefined

  const works = await listDiscoverWorks({
    userId: sessionUser?.id ?? null,
    per: DECK_SIZE,
    section,
    platforms: platformsForQuery,
  })

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Découverte</h1>
      <SegmentedControl
        ariaLabel="Sections"
        value={section}
        items={WORK_SECTION_VALUES.map((s) => ({
          label: WORK_SECTION_LABELS[s],
          value: s,
          href: `/discover?section=${s}`,
        }))}
      />

      {isStreaming ? <StreamingPlatformFilter available={availablePlatforms} selected={selectedPlatforms} /> : null}

      <SwipeDeck key={`${section}:${selectedPlatforms.join(',')}`} items={works.items} totalCount={works.total} authed={Boolean(sessionUser)} />
    </div>
  )
}
