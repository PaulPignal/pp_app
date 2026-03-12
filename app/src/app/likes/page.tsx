// src/app/likes/page.tsx
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/features/auth/server/session'
import { listLikedWorks } from '@/features/reactions/server/queries'
import LikeActions from '@/features/reactions/ui/LikeActions'
import { isWorkCurrentlyShowing } from '@/features/works/availability'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

export default async function LikesPage() {
  let sessionUser
  try {
    sessionUser = await requireSessionUser()
  } catch {
    redirect(SIGN_IN_PATH)
  }

  const likes = await listLikedWorks(sessionUser.id)
  const currentLikes = likes.filter((like) => isWorkCurrentlyShowing(like.work?.endDate))
  const archivedLikes = likes.filter((like) => !isWorkCurrentlyShowing(like.work?.endDate))

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-3 text-2xl font-semibold">Mes likes</h1>

      {likes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun like pour l’instant.</p>
      ) : (
        <div className="space-y-8">
          <LikesSection
            title="À l’affiche"
            description="Ces oeuvres sont encore en cours de programmation."
            emptyLabel="Aucun like actuellement à l’affiche."
            likes={currentLikes}
          />

          {archivedLikes.length > 0 ? (
            <LikesSection
              title="Plus à l’affiche"
              description="Retrouve ici les films et pièces dont la programmation est terminée."
              emptyLabel="Aucun like archivé."
              likes={archivedLikes}
            />
          ) : null}
        </div>
      )}
    </main>
  )
}

type LikesSectionProps = {
  title: string
  description: string
  emptyLabel: string
  likes: Awaited<ReturnType<typeof listLikedWorks>>
}

function LikesSection({ title, description, emptyLabel, likes }: LikesSectionProps) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {likes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {likes.map((like) => (
            <li key={like.workId} className="rounded-2xl border p-2">
              <article>
                <div className="relative h-40 w-full overflow-hidden rounded-xl bg-muted">
                  {like.work?.imageUrl ? (
                    <Image
                      src={like.work.imageUrl}
                      alt={like.work.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 300px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Pas d’image
                    </div>
                  )}
                </div>

                <h3 className="mt-2 line-clamp-2 text-sm font-medium">{like.work?.title ?? like.workId}</h3>

                {like.work?.sourceUrl ? (
                  <a
                    href={like.work.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block rounded-xl border px-3 py-1 text-sm"
                  >
                    Voir la source
                  </a>
                ) : null}

                <LikeActions workId={like.workId} />
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
