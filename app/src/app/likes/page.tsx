import { requireSessionUserOrRedirect } from '@/features/auth/server/session'
import { listLikedWorks } from '@/features/reactions/server/queries'
import LikesLibrary from '@/features/reactions/ui/LikesLibrary'
import { isWorkCurrentlyShowing } from '@/features/works/availability'

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
  const sessionUser = await requireSessionUserOrRedirect()

  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const view = resolveLikesView(resolvedSearchParams?.view)
  const likes = await listLikedWorks(sessionUser.id)
  const currentLikes = likes.filter((like) => isWorkCurrentlyShowing(like.work?.endDate))
  const archivedLikes = likes.filter((like) => !isWorkCurrentlyShowing(like.work?.endDate))

  return (
    <div className="page-shell">
      <LikesLibrary current={currentLikes} archived={archivedLikes} view={view} />
    </div>
  )
}
