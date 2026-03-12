import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/features/auth/server/session'
import { listLikedWorks } from '@/features/reactions/server/queries'
import LikeActions from '@/features/reactions/ui/LikeActions'
import { isWorkCurrentlyShowing } from '@/features/works/availability'
import WorkSummaryCard from '@/features/works/ui/WorkSummaryCard'
import { SIGN_IN_PATH } from '@/shared/lib/routes'
import PageHeader from '@/shared/ui/PageHeader'
import SegmentedControl from '@/shared/ui/SegmentedControl'
import SurfaceCard from '@/shared/ui/SurfaceCard'

type LikesPageProps = {
  searchParams?: Promise<{
    view?: string | string[]
  }>
}

type LikesView = 'all' | 'active' | 'archived'

function resolveLikesView(value: string | string[] | undefined): LikesView {
  const candidate = Array.isArray(value) ? value[0] : value
  if (candidate === 'active' || candidate === 'archived') {
    return candidate
  }
  return 'all'
}

export default async function LikesPage({ searchParams }: LikesPageProps = {}) {
  let sessionUser
  try {
    sessionUser = await requireSessionUser()
  } catch {
    redirect(SIGN_IN_PATH)
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const view = resolveLikesView(resolvedSearchParams?.view)
  const likes = await listLikedWorks(sessionUser.id)
  const currentLikes = likes.filter((like) => isWorkCurrentlyShowing(like.work?.endDate))
  const archivedLikes = likes.filter((like) => !isWorkCurrentlyShowing(like.work?.endDate))

  return (
    <div className="page-shell">
      <PageHeader
        eyebrow="Bibliothèque"
        title="Mes likes"
        description="Retrouve tes coups de coeur, trie-les entre les oeuvres encore a l'affiche et celles deja terminees, puis garde seulement ce qui merite de revenir dans ta file."
        meta={
          <>
            <span className="chip">{likes.length} likes au total</span>
            <span className="chip">{currentLikes.length} en cours</span>
            <span className="chip">{archivedLikes.length} archives</span>
          </>
        }
      >
        <SegmentedControl
          ariaLabel="Filtrer les likes"
          value={view}
          items={[
            { label: 'Tous', value: 'all', href: '/likes', count: likes.length },
            { label: 'À l’affiche', value: 'active', href: '/likes?view=active', count: currentLikes.length },
            { label: 'Archivées', value: 'archived', href: '/likes?view=archived', count: archivedLikes.length },
          ]}
        />
      </PageHeader>

      {likes.length === 0 ? (
        <SurfaceCard>
          <div className="empty-state">
            <span className="chip">Bibliothèque vide</span>
            <strong>Aucun like pour l’instant.</strong>
            <p className="max-w-md text-sm leading-7 text-muted-foreground">
              Passe par la découverte pour commencer une collection personnelle d&apos;idées de sorties.
            </p>
          </div>
        </SurfaceCard>
      ) : (
        <div className="space-y-8">
          {view !== 'archived' ? (
            <LikesSection
              title="À l’affiche"
              description="Ces oeuvres sont encore en cours de programmation."
              emptyLabel="Aucun like actuellement à l’affiche."
              likes={currentLikes}
              tone="accent"
            />
          ) : null}

          {view !== 'active' ? (
            <LikesSection
              title="Plus à l’affiche"
              description="Retrouve ici les films et pièces dont la programmation est terminée."
              emptyLabel="Aucun like archivé."
              likes={archivedLikes}
              tone="muted"
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

type LikesSectionProps = {
  title: string
  description: string
  emptyLabel: string
  likes: Awaited<ReturnType<typeof listLikedWorks>>
  tone: 'accent' | 'muted'
}

function LikesSection({ title, description, emptyLabel, likes, tone }: LikesSectionProps) {
  return (
    <SurfaceCard as="section" tone={tone} className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h2>
          <p className="text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
        <span className="chip">{likes.length} oeuvre{likes.length > 1 ? 's' : ''}</span>
      </div>

      {likes.length === 0 ? (
        <div className="empty-state rounded-[1.5rem] border border-dashed border-[color:var(--color-border)] bg-white/50">
          <strong>{emptyLabel}</strong>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {likes.map((like) => (
            <li key={like.workId} className="h-full">
              <WorkSummaryCard
                work={like.work}
                fallbackTitle={like.workId}
                actions={<LikeActions workId={like.workId} />}
              />
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  )
}
