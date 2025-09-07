'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

type LikeItem = {
  workId: string
  work?: { id: string; title: string; imageUrl?: string | null; sourceUrl?: string | null }
}

async function fetchJsonSafe(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  const text = await res.text() // gère les réponses vides
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`)
  }
  return data
}

export default function LikesPage() {
  const [likes, setLikes] = useState<LikeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await fetchJsonSafe('/api/likes', { cache: 'no-store' })
      setLikes(Array.isArray(d?.likes) ? d.likes : [])
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger les likes')
      setLikes([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markSeen = async (workId: string) => {
    try {
      await fetchJsonSafe('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workId, action: 'seen' }),
      })
    } catch {
      // no-op en dev
    }
    reload()
  }

  const unlike = async (workId: string) => {
    try {
      await fetchJsonSafe('/api/likes?workId=' + encodeURIComponent(workId), {
        method: 'DELETE',
      })
    } catch {
      // no-op en dev
    }
    reload()
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <h1 className="mb-3 text-2xl font-semibold">Mes likes</h1>
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <h1 className="mb-3 text-2xl font-semibold">Mes likes</h1>
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={reload} className="mt-3 rounded-2xl border px-3 py-1">
          Réessayer
        </button>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-3 text-2xl font-semibold">Mes likes</h1>

      {likes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun like pour l’instant.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {likes.map((l) => (
            <li key={l.workId} className="rounded-2xl border p-2">
              <article>
                <div className="relative h-40 w-full overflow-hidden rounded-xl bg-muted">
                  {l.work?.imageUrl ? (
                    <Image
                      src={l.work.imageUrl}
                      alt={l.work.title}
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
                <h2 className="mt-2 line-clamp-2 text-sm font-medium">{l.work?.title ?? l.workId}</h2>

                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded-xl border px-3 py-1 text-sm"
                    onClick={() => markSeen(l.workId)}
                    title="Marquer comme vu"
                  >
                    Vu
                  </button>
                  <button
                    className="rounded-xl border px-3 py-1 text-sm"
                    onClick={() => unlike(l.workId)}
                    title="Retirer le like"
                  >
                    Retirer
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}