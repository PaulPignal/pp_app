// src/app/likes/page.tsx
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/features/auth/server/session'
import { listLikedWorks } from '@/features/reactions/server/queries'
import LikeActions from '@/features/reactions/ui/LikeActions'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

export default async function LikesPage() {
  let sessionUser
  try {
    sessionUser = await requireSessionUser()
  } catch {
    redirect(SIGN_IN_PATH)
  }

  const likes = await listLikedWorks(sessionUser.id)

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-3 text-2xl font-semibold">Mes likes</h1>

      {likes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun like pour l’instant.</p>
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

                <h2 className="mt-2 line-clamp-2 text-sm font-medium">{like.work?.title ?? like.workId}</h2>

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
    </main>
  )
}
