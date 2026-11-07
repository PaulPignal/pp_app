'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import type { FriendLikerDto } from '@/features/friendships/dto'
import type { WorkCardDto } from '@/features/works/dto'
import CompactLikeCard from '@/features/reactions/ui/CompactLikeCard'
import LikeDetailModal, { type LikeBucket } from '@/features/reactions/ui/LikeDetailModal'
import { WORK_SECTION_LABELS, WORK_SECTION_VALUES, type WorkSection } from '@/features/works/section'
import { fetchJson } from '@/shared/lib/fetch-json'
import EmptyState from '@/shared/ui/EmptyState'
import { IconSearch, IconX } from '@/shared/ui/icons'
import SegmentedControl from '@/shared/ui/SegmentedControl'

export type LikedItem = {
  workId: string
  work: WorkCardDto | null
}

type LikesView = 'all' | 'active' | 'archived' | 'seen'

type Props = {
  current: LikedItem[]
  archived: LikedItem[]
  seen: LikedItem[]
  friendsByWork: Record<string, FriendLikerDto[]>
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
  const [section, setSection] = useState<'all' | WorkSection>('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const sortId = useId()
  const sectionId = useId()

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
        setError('Action non enregistrée. Réessayez.')
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
        setError('Action non enregistrée. Réessayez.')
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
        setError('Annulation impossible. Réessayez.')
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
  }, [baseItems, query, section, sort])

  const selectedItem = useMemo(() => {
    if (!selected) return null
    return (
      active.find((i) => i.workId === selected.workId) ??
      archive.find((i) => i.workId === selected.workId) ??
      seenList.find((i) => i.workId === selected.workId) ??
      null
    )
  }, [selected, active, archive, seenList])

  const hasFilters = query.trim().length > 0 || section !== 'all'

  return (
    <>
      <h1 className="sr-only">Mes likes</h1>

      {totalLikes + seenList.length === 0 ? (
        <EmptyState
          title="Aucun like pour l’instant"
          action={
            <Link href="/discover" className="btn btn-primary">
              Aller à la découverte
            </Link>
          }
        >
          Les œuvres que vous aimez en découverte se retrouvent ici, triées entre ce qui est encore à l’affiche et ce que vous avez déjà vu.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Vue (état des likes) + tri. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StateTabs active={active.length} archived={archive.length} seen={seenList.length} view={view} />
            <div className="flex items-center gap-2">
              <label htmlFor={sortId} className="text-sm text-ink-muted">
                Trier
              </label>
              <select id={sortId} className="input select w-auto text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="recent">Récents</option>
                <option value="ending">Fin de programmation</option>
                <option value="price">Prix croissant</option>
              </select>
            </div>
          </div>

          {/* Recherche + section. */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                className="input pl-10"
                placeholder="Titre, lieu, metteur en scène…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Rechercher dans mes likes"
              />
            </div>
            <label htmlFor={sectionId} className="sr-only">
              Filtrer par section
            </label>
            <select id={sectionId} className="input select sm:w-52" value={section} onChange={(e) => setSection(e.target.value as 'all' | WorkSection)}>
              <option value="all">Toutes les sections</option>
              {WORK_SECTION_VALUES.map((s) => (
                <option key={s} value={s}>
                  {WORK_SECTION_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {items.length === 0 ? (
            <EmptyState
              variant="inline"
              title={hasFilters ? 'Aucun résultat' : 'Rien ici pour le moment'}
              action={
                hasFilters ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setQuery('')
                      setSection('all')
                    }}
                  >
                    Effacer les filtres
                  </button>
                ) : null
              }
            >
              {hasFilters ? 'Aucun like ne correspond à cette recherche ou à cette section.' : 'Cette vue est vide.'}
            </EmptyState>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.map((item) => (
                <li key={item.workId}>
                  <CompactLikeCard
                    work={item.work}
                    fallbackTitle={item.workId}
                    friends={friendsByWork[item.workId] ?? []}
                    onOpen={() => setSelected({ workId: item.workId, bucket: baseItems.bucket })}
                    onRemove={() => remove(item, view === 'seen' ? 'seen' : bucketOf(item, archive))}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error ? (
        <p role="alert" className="notice notice-error mt-4">
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
          onSeen={() => markSeen(selectedItem, bucketOf(selectedItem, archive))}
          onRemove={() => remove(selectedItem, selected.bucket === 'seen' ? 'seen' : bucketOf(selectedItem, archive))}
        />
      ) : null}

      <UndoToast toast={toast} busy={busy} onUndo={undo} onDismiss={() => setToast(null)} />
    </>
  )
}

// Détermine si une œuvre likée est dans la liste active ou archivée.
function bucketOf(item: LikedItem, archive: LikedItem[]): SourceBucket {
  return archive.some((i) => i.workId === item.workId) ? 'archived' : 'active'
}

// États du like : À l'affiche (défaut), Archivées (programmation terminée), Déjà vus.
const STATE_TABS: { value: LikesView; label: string; href: string }[] = [
  { value: 'active', label: 'À l’affiche', href: '/likes?view=active' },
  { value: 'archived', label: 'Archivées', href: '/likes?view=archived' },
  { value: 'seen', label: 'Déjà vus', href: '/likes?view=seen' },
]

function StateTabs({ active, archived, seen, view }: { active: number; archived: number; seen: number; view: LikesView }) {
  const counts: Record<string, number> = { active, archived, seen }
  const current: LikesView = view === 'archived' || view === 'seen' ? view : 'active'
  return (
    <SegmentedControl
      ariaLabel="État des likes"
      value={current}
      items={STATE_TABS.map((t) => ({ label: t.label, value: t.value, href: t.href, count: counts[t.value] }))}
    />
  )
}

function UndoToast({ toast, busy, onUndo, onDismiss }: { toast: Toast | null; busy: boolean; onUndo: (t: Toast) => void; onDismiss: () => void }) {
  if (!toast) return null
  return (
    <div
      role="status"
      className="notice fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto w-fit max-w-full items-center bg-raised shadow-menu lg:bottom-6"
    >
      <span className="min-w-0 truncate">
        « {toast.title} » {toast.message}
      </span>
      <button type="button" onClick={() => onUndo(toast)} disabled={busy} className="btn btn-ghost -my-2 min-h-10 shrink-0 px-3 text-accent">
        {busy ? '…' : 'Annuler'}
      </button>
      <button type="button" onClick={onDismiss} aria-label="Fermer" className="btn-icon -my-2 -mr-2 h-9 w-9 shrink-0">
        <IconX size={16} />
      </button>
    </div>
  )
}
