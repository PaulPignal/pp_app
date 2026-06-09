'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FriendSummaryDto } from '@/features/friendships/dto'
import type { WorkCardDto } from '@/features/works/dto'
import CompactLikeCard from '@/features/reactions/ui/CompactLikeCard'
import LikeDetailModal, { type LikeBucket } from '@/features/reactions/ui/LikeDetailModal'
import { fetchJson } from '@/shared/lib/fetch-json'
import SegmentedControl from '@/shared/ui/SegmentedControl'
import SurfaceCard from '@/shared/ui/SurfaceCard'

export type LikedItem = {
  workId: string
  work: WorkCardDto | null
}

type LikesView = 'all' | 'active' | 'archived' | 'seen'

type Props = {
  current: LikedItem[]
  archived: LikedItem[]
  seen: LikedItem[]
  friendsByWork: Record<string, FriendSummaryDto[]>
  view: LikesView
}

type ReactionStatus = 'LIKE' | 'SEEN' | 'DISLIKE'
type SourceBucket = 'active' | 'archived' | 'seen'
type SortKey = 'recent' | 'ending' | 'price'

type Toast = {
  item: LikedItem
  title: string
  message: string
  from: SourceBucket
  undoStatus: 'LIKE' | 'SEEN'
}

const UNDO_WINDOW_MS = 6000

function titleOf(item: LikedItem) {
  return item.work?.title?.trim() || 'cette œuvre'
}

async function postStatus(workId: string, status: ReactionStatus) {
  await fetchJson('/api/reactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workId, status }),
  })
}

export default function LikesLibrary({ current, archived, seen, friendsByWork, view }: Props) {
  const [active, setActive] = useState(current)
  const [archive, setArchive] = useState(archived)
  const [seenList, setSeenList] = useState(seen)
  const [toast, setToast] = useState<Toast | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ workId: string; bucket: LikeBucket } | null>(null)

  // Filtres / tri (côté client).
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<'all' | 'theatre' | 'cinema'>('all')
  const [bookableOnly, setBookableOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('recent')

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), UNDO_WINDOW_MS)
    return () => clearTimeout(id)
  }, [toast])

  // Les setters useState sont stables → callbacks sans dépendances.
  const setterFor = useCallback(
    (bucket: SourceBucket) => (bucket === 'active' ? setActive : bucket === 'archived' ? setArchive : setSeenList),
    [],
  )

  const removeFrom = useCallback(
    (bucket: SourceBucket, workId: string) => {
      setterFor(bucket)((prev) => prev.filter((i) => i.workId !== workId))
    },
    [setterFor],
  )

  const addTo = useCallback(
    (bucket: SourceBucket, item: LikedItem) => {
      setterFor(bucket)((prev) => (prev.some((i) => i.workId === item.workId) ? prev : [item, ...prev]))
    },
    [setterFor],
  )

  // Marquer vu : déplace une œuvre likée vers « Déjà vus ».
  const markSeen = useCallback(
    async (item: LikedItem, from: SourceBucket) => {
      setError(null)
      setSelected(null)
      removeFrom(from, item.workId)
      addTo('seen', item)
      setToast({ item, title: titleOf(item), message: 'marqué comme vu', from, undoStatus: 'LIKE' })
      try {
        await postStatus(item.workId, 'SEEN')
      } catch {
        removeFrom('seen', item.workId)
        addTo(from, item)
        setToast(null)
        setError('Action non enregistrée. Réessaie.')
      }
    },
    [addTo, removeFrom],
  )

  // Retirer : sort l'œuvre de la bibliothèque.
  const remove = useCallback(
    async (item: LikedItem, from: SourceBucket) => {
      setError(null)
      setSelected(null)
      removeFrom(from, item.workId)
      const undoStatus = from === 'seen' ? 'SEEN' : 'LIKE'
      setToast({ item, title: titleOf(item), message: 'retiré', from, undoStatus })
      try {
        await postStatus(item.workId, 'DISLIKE')
      } catch {
        addTo(from, item)
        setToast(null)
        setError('Action non enregistrée. Réessaie.')
      }
    },
    [addTo, removeFrom],
  )

  const undo = useCallback(
    async (t: Toast) => {
      if (busy) return
      setBusy(true)
      setError(null)
      // markSeen a pu déplacer l'item vers « Déjà vus » : on l'en retire puis on restaure.
      removeFrom('seen', t.item.workId)
      addTo(t.from, t.item)
      setToast(null)
      try {
        await postStatus(t.item.workId, t.undoStatus)
      } catch {
        setError('Annulation impossible. Réessaie.')
      } finally {
        setBusy(false)
      }
    },
    [addTo, busy, removeFrom],
  )

  const totalLikes = active.length + archive.length

  // Liste de base selon l'onglet.
  const baseItems = useMemo<{ items: LikedItem[]; bucket: LikeBucket }>(() => {
    if (view === 'seen') return { items: seenList, bucket: 'seen' }
    if (view === 'active') return { items: active, bucket: 'like' }
    if (view === 'archived') return { items: archive, bucket: 'like' }
    return { items: [...active, ...archive], bucket: 'like' }
  }, [view, active, archive, seenList])

  // Filtres + tri.
  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = baseItems.items.filter((item) => {
      const w = item.work
      if (section !== 'all' && w?.section !== section) return false
      if (bookableOnly && w?.availability !== 'InStock') return false
      if (q) {
        const hay = [w?.title, w?.venue, w?.director, w?.arrondissement].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    if (sort === 'ending') {
      list = [...list].sort((a, b) => {
        const da = a.work?.endDate ? new Date(a.work.endDate).getTime() : Infinity
        const db = b.work?.endDate ? new Date(b.work.endDate).getTime() : Infinity
        return da - db
      })
    } else if (sort === 'price') {
      list = [...list].sort((a, b) => (a.work?.priceMin ?? Infinity) - (b.work?.priceMin ?? Infinity))
    }
    return list
  }, [baseItems, query, section, bookableOnly, sort])

  const selectedItem = useMemo(() => {
    if (!selected) return null
    return (
      active.find((i) => i.workId === selected.workId) ??
      archive.find((i) => i.workId === selected.workId) ??
      seenList.find((i) => i.workId === selected.workId) ??
      null
    )
  }, [selected, active, archive, seenList])

  return (
    <>
      <h1 className="sr-only">Mes likes</h1>
      <SegmentedControl
        ariaLabel="Filtrer les likes"
        value={view}
        fullWidth
        items={[
          { label: 'Tous', value: 'all', href: '/likes', count: totalLikes },
          { label: 'À l’affiche', value: 'active', href: '/likes?view=active', count: active.length },
          { label: 'Archivées', value: 'archived', href: '/likes?view=archived', count: archive.length },
          { label: 'Déjà vus', value: 'seen', href: '/likes?view=seen', count: seenList.length },
        ]}
      />

      {totalLikes + seenList.length === 0 ? (
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
        <div className="space-y-4">
          <Toolbar
            query={query}
            onQuery={setQuery}
            section={section}
            onSection={setSection}
            bookableOnly={bookableOnly}
            onBookable={setBookableOnly}
            sort={sort}
            onSort={setSort}
          />

          {items.length === 0 ? (
            <div className="empty-state rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border)] bg-white/50">
              <strong>Rien ne correspond à ce filtre.</strong>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.map((item) => (
                <li key={item.workId}>
                  <CompactLikeCard
                    work={item.work}
                    fallbackTitle={item.workId}
                    friends={friendsByWork[item.workId] ?? []}
                    onOpen={() => setSelected({ workId: item.workId, bucket: baseItems.bucket })}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error ? (
        <p role="status" className="mt-4 text-center text-sm font-medium text-[color:var(--color-danger)]">
          {error}
        </p>
      ) : null}

      {selected && selectedItem ? (
        <LikeDetailModal
          work={selectedItem.work}
          fallbackTitle={selectedItem.workId}
          friends={friendsByWork[selectedItem.workId] ?? []}
          bucket={selected.bucket}
          onClose={() => setSelected(null)}
          onSeen={() => markSeen(selectedItem, bucketOf(selectedItem, active, archive))}
          onRemove={() => remove(selectedItem, selected.bucket === 'seen' ? 'seen' : bucketOf(selectedItem, active, archive))}
        />
      ) : null}

      <UndoToast toast={toast} busy={busy} onUndo={undo} onDismiss={() => setToast(null)} />
    </>
  )
}

// Détermine si une œuvre likée est dans la liste active ou archivée.
function bucketOf(item: LikedItem, active: LikedItem[], archive: LikedItem[]): SourceBucket {
  if (archive.some((i) => i.workId === item.workId)) return 'archived'
  return 'active'
}

function Toolbar({
  query,
  onQuery,
  section,
  onSection,
  bookableOnly,
  onBookable,
  sort,
  onSort,
}: {
  query: string
  onQuery: (v: string) => void
  section: 'all' | 'theatre' | 'cinema'
  onSection: (v: 'all' | 'theatre' | 'cinema') => void
  bookableOnly: boolean
  onBookable: (v: boolean) => void
  sort: SortKey
  onSort: (v: SortKey) => void
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <input
        type="search"
        className="input lg:max-w-xs"
        placeholder="Rechercher (titre, lieu, metteur en scène…)"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        aria-label="Rechercher dans mes likes"
      />
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          ariaLabel="Filtrer par type"
          value={section}
          onChange={(v) => onSection(v as 'all' | 'theatre' | 'cinema')}
          items={[
            { label: 'Tout', value: 'all' },
            { label: 'Théâtre', value: 'theatre' },
            { label: 'Cinéma', value: 'cinema' },
          ]}
        />
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-white/70 px-3 py-1.5 text-xs font-medium">
          <input type="checkbox" checked={bookableOnly} onChange={(e) => onBookable(e.target.checked)} />
          Réservable
        </label>
        <select
          className="input w-auto py-1.5 text-sm"
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          aria-label="Trier"
        >
          <option value="recent">Récents</option>
          <option value="ending">Fin proche</option>
          <option value="price">Prix croissant</option>
        </select>
      </div>
    </div>
  )
}

function UndoToast({
  toast,
  busy,
  onUndo,
  onDismiss,
}: {
  toast: Toast | null
  busy: boolean
  onUndo: (t: Toast) => void
  onDismiss: () => void
}) {
  if (!toast) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-6 z-[60] mx-auto flex w-fit max-w-[90vw] items-center gap-4 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-strong)] px-5 py-3 shadow-[var(--shadow-lg)]"
    >
      <span className="text-sm font-medium text-[color:var(--color-text)]">
        « {toast.title} » {toast.message}
      </span>
      <button
        type="button"
        onClick={() => onUndo(toast)}
        disabled={busy}
        className="text-sm font-semibold text-[color:var(--color-accent)] underline-offset-2 hover:underline disabled:opacity-50"
      >
        {busy ? '…' : 'Annuler'}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer"
        className="text-sm text-muted-foreground hover:text-[color:var(--color-text)]"
      >
        ✕
      </button>
    </div>
  )
}
