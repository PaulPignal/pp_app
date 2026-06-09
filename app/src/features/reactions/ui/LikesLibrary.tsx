'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { FriendSummaryDto } from '@/features/friendships/dto'
import type { WorkCardDto } from '@/features/works/dto'
import CompactLikeCard from '@/features/reactions/ui/CompactLikeCard'
import LikeDetailModal, { type LikeBucket } from '@/features/reactions/ui/LikeDetailModal'
import { WORK_SECTION_LABELS, WORK_SECTION_VALUES, type WorkSection } from '@/features/works/section'
import { fetchJson } from '@/shared/lib/fetch-json'
import { cn } from '@/shared/lib/cn'
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
  const [section, setSection] = useState<'all' | WorkSection>('all')
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

  return (
    <>
      <h1 className="sr-only">Mes likes</h1>

      {/* Barre d'univers défilante (même modèle que Discover) : filtre par thématique. */}
      <SegmentedControl
        ariaLabel="Filtrer par univers"
        value={section}
        scroll
        onChange={(value) => setSection(value as 'all' | WorkSection)}
        items={[
          { label: 'Tous', value: 'all' },
          ...WORK_SECTION_VALUES.map((s) => ({ label: WORK_SECTION_LABELS[s], value: s })),
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
          {/* Contrôles : états (onglets texte discrets, hiérarchie ≠ des univers) + recherche + tri. */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-[color:var(--color-border)] pb-2">
              <StateTabs active={active.length} archived={archive.length} seen={seenList.length} view={view} />
              <SortMenu sort={sort} onSort={setSort} />
            </div>
            <input
              type="search"
              className="input py-2 text-sm"
              placeholder="Rechercher (titre, lieu, metteur en scène…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Rechercher dans mes likes"
            />
          </div>

          {items.length === 0 ? (
            <div className="empty-state rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
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
                    onRemove={() => remove(item, view === 'seen' ? 'seen' : bucketOf(item, active, archive))}
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

// États du like : onglets TEXTE discrets (hiérarchie ≠ des pastilles d'univers,
// pour éviter l'effet « deux barres en doublon »). Pas de « Tous » → défaut À l'affiche.
const STATE_TABS: { value: LikesView; label: string; href: string }[] = [
  { value: 'active', label: 'À l’affiche', href: '/likes?view=active' },
  { value: 'archived', label: 'Archivées', href: '/likes?view=archived' },
  { value: 'seen', label: 'Déjà vus', href: '/likes?view=seen' },
]

function StateTabs({ active, archived, seen, view }: { active: number; archived: number; seen: number; view: LikesView }) {
  const counts: Record<string, number> = { active, archived, seen }
  const current: LikesView = view === 'archived' || view === 'seen' ? view : 'active'
  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-1" aria-label="État des likes">
      {STATE_TABS.map((t) => {
        const on = current === t.value
        return (
          <Link
            key={t.value}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 text-sm transition',
              on
                ? 'font-semibold text-[color:var(--color-text)]'
                : 'font-medium text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]',
            )}
          >
            {t.label}
            <span className={cn('text-xs tabular-nums', on ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-muted)]')}>
              {counts[t.value]}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

const SORT_OPTIONS: { k: SortKey; l: string }[] = [
  { k: 'recent', l: 'Récents' },
  { k: 'ending', l: 'Fin proche' },
  { k: 'price', l: 'Prix croissant' },
]

// Vrai bouton « Trier par » avec menu (au lieu d'un <select> natif).
function SortMenu({ sort, onSort }: { sort: SortKey; onSort: (v: SortKey) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const current = SORT_OPTIONS.find((o) => o.k === sort) ?? SORT_OPTIONS[0]

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-control-bg)] px-3.5 py-2 text-sm font-semibold text-[color:var(--color-text)] transition hover:border-[color:var(--color-border-strong)]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 5v14M7 19l-3-3M7 5l3 3M17 19V5M17 5l-3 3M17 19l3-3" />
        </svg>
        Trier : {current.l}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn('transition', open && 'rotate-180')}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-strong)] p-1 shadow-[var(--shadow-lg)]"
        >
          {SORT_OPTIONS.map((o) => {
            const on = o.k === sort
            return (
              <button
                key={o.k}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  onSort(o.k)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm transition',
                  on
                    ? 'bg-[color:var(--color-fill)] font-semibold text-[color:var(--color-text)]'
                    : 'text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-fill)] hover:text-[color:var(--color-text)]',
                )}
              >
                {o.l}
                {on ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
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
