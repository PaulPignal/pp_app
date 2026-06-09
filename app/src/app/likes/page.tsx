import { requireSessionUserOrRedirect } from '@/features/auth/server/session'
import { friendsWhoLiked, listLibraryWorks } from '@/features/reactions/server/queries'
import LikesLibrary from '@/features/reactions/ui/LikesLibrary'
import { isWorkCurrentlyShowing } from '@/features/works/availability'

type LikesPageProps = {
  searchParams?: Promise<{
    view?: string | string[]
  }>
}

type LikesView = 'all' | 'active' | 'archived' | 'seen'

function resolveLikesView(value: string | string[] | undefined): LikesView {
  const candidate = Array.isArray(value) ? value[0] : value
  if (candidate === 'archived' || candidate === 'seen') {
    return candidate
  }
  // Plus de vue « Tous » : par défaut, on montre ce qui est encore à l'affiche.
  return 'active'
}

export default async function LikesPage({ searchParams }: LikesPageProps = {}) {
  const sessionUser = await requireSessionUserOrRedirect()

  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const view = resolveLikesView(resolvedSearchParams?.view)

  const { likes, seen } = await listLibraryWorks(sessionUser.id)
  const current = likes.filter((like) => isWorkCurrentlyShowing(like.work?.endDate))
  const archived = likes.filter((like) => !isWorkCurrentlyShowing(like.work?.endDate))

  const allWorkIds = [...likes, ...seen].map((item) => item.workId)
  const friendsByWork = await friendsWhoLiked(sessionUser.id, allWorkIds)

  return (
    <div className="page-shell">
      <LikesLibrary current={current} archived={archived} seen={seen} friendsByWork={friendsByWork} view={view} />
    </div>
  )
}
