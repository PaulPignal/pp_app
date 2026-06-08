'use client'

import { useCallback, useEffect, useState } from 'react'
import type { WorkCardDto } from '@/features/works/dto'
import WorkSummaryCard from '@/features/works/ui/WorkSummaryCard'
import { fetchJson } from '@/shared/lib/fetch-json'
import PageHeader from '@/shared/ui/PageHeader'
import SegmentedControl from '@/shared/ui/SegmentedControl'
import SurfaceCard from '@/shared/ui/SurfaceCard'

export type LikedItem = {
  workId: string
  work: WorkCardDto | null
}

type LikesView = 'all' | 'active' | 'archived'

type Props = {
  current: LikedItem[]
  archived: LikedItem[]
  view: LikesView
}

// "Marquer vu" et "Retirer" sortent tous deux l'œuvre des likes, mais avec un sens
// différent côté serveur (SEEN = consommée / DISLIKE = plus intéressé). Le toast
// rend cette conséquence explicite et offre un retour arrière immédiat.
type RemovalStatus = 'SEEN' | 'DISLIKE'

type Toast = {
  workId: string
  title: string
  status: RemovalStatus
}

const UNDO_WINDOW_MS = 6000

function titleOf(item: LikedItem) {
  return item.work?.title?.trim() || 'cette œuvre'
}

async function postStatus(workId: string, status: RemovalStatus | 'LIKE') {
  await fetchJson('/api/reactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workId, status }),
  })
}

export default function LikesLibrary({ current, archived, view }: Props) {
  const [removed, setRemoved] = useState<Set<string>>(() => new Set())
  const [toast, setToast] = useState<Toast | null>(null)
  const [undoing, setUndoing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-dismiss : la fenêtre d'undo se relance à chaque nouveau toast.
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), UNDO_WINDOW_MS)
    return () => clearTimeout(id)
  }, [toast])

  const hide = useCallback((workId: string) => {
    setRemoved((prev) => {
      const next = new Set(prev)
      next.add(workId)
      return next
    })
  }, [])

  const unhide = useCallback((workId: string) => {
    setRemoved((prev) => {
      if (!prev.has(workId)) return prev
      const next = new Set(prev)
      next.delete(workId)
      return next
    })
  }, [])

  const act = useCallback(
    async (item: LikedItem, status: RemovalStatus) => {
      setError(null)
      // Update optimiste : la carte disparaît immédiatement (plus de router.refresh global).
      hide(item.workId)
      setToast({ workId: item.workId, title: titleOf(item), status })
      try {
        await postStatus(item.workId, status)
      } catch {
        // Rollback explicite : la carte revient, le toast disparaît.
        unhide(item.workId)
        setToast(null)
        setError('Action non enregistrée. Réessaie.')
      }
    },
    [hide, unhide],
  )

  const undo = useCallback(
    async (workId: string) => {
      if (undoing) return
      setUndoing(true)
      setError(null)
      unhide(workId)
      setToast(null)
      try {
        await postStatus(workId, 'LIKE')
      } catch {
        hide(workId)
        setError('Annulation impossible. Réessaie.')
      } finally {
        setUndoing(false)
      }
    },
    [hide, unhide, undoing],
  )

  const visibleCurrent = current.filter((item) => !removed.has(item.workId))
  const visibleArchived = archived.filter((item) => !removed.has(item.workId))
  const total = visibleCurrent.length + visibleArchived.length

  return (
    <>
      <PageHeader
        eyebrow="Bibliothèque"
        title="Mes likes"
        description="Retrouve tes coups de coeur, trie-les entre les oeuvres encore a l'affiche et celles deja terminees, puis garde seulement ce qui merite de revenir dans ta file."
        meta={
          <>
            <span className="chip">{total} like{total > 1 ? 's' : ''} au total</span>
            <span className="chip">{visibleCurrent.length} en cours</span>
            <span className="chip">{visibleArchived.length} archives</span>
          </>
        }
      >
        <SegmentedControl
          ariaLabel="Filtrer les likes"
          value={view}
          items={[
            { label: 'Tous', value: 'all', href: '/likes', count: total },
            { label: 'À l’affiche', value: 'active', href: '/likes?view=active', count: visibleCurrent.length },
            { label: 'Archivées', value: 'archived', href: '/likes?view=archived', count: visibleArchived.length },
          ]}
        />
      </PageHeader>

      {total === 0 ? (
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
              items={visibleCurrent}
              tone="accent"
              onAct={act}
            />
          ) : null}

          {view !== 'active' ? (
            <LikesSection
              title="Plus à l’affiche"
              description="Retrouve ici les films et pièces dont la programmation est terminée."
              emptyLabel="Aucun like archivé."
              items={visibleArchived}
              tone="muted"
              onAct={act}
            />
          ) : null}
        </div>
      )}

      {error ? (
        <p role="status" className="mt-4 text-center text-sm font-medium text-[color:var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <UndoToast toast={toast} undoing={undoing} onUndo={undo} onDismiss={() => setToast(null)} />
    </>
  )
}

type LikesSectionProps = {
  title: string
  description: string
  emptyLabel: string
  items: LikedItem[]
  tone: 'accent' | 'muted'
  onAct: (item: LikedItem, status: RemovalStatus) => void
}

function LikesSection({ title, description, emptyLabel, items, tone, onAct }: LikesSectionProps) {
  return (
    <SurfaceCard as="section" tone={tone} className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h2>
          <p className="text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
        <span className="chip">{items.length} oeuvre{items.length > 1 ? 's' : ''}</span>
      </div>

      {items.length === 0 ? (
        <div className="empty-state rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border)] bg-white/50">
          <strong>{emptyLabel}</strong>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <li key={item.workId} className="h-full">
              <WorkSummaryCard
                work={item.work}
                fallbackTitle={item.workId}
                actions={
                  <CardActions
                    onSeen={() => onAct(item, 'SEEN')}
                    onRemove={() => onAct(item, 'DISLIKE')}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  )
}

function CardActions({ onSeen, onRemove }: { onSeen: () => void; onRemove: () => void }) {
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      <button
        type="button"
        className="btn btn-secondary min-w-[6.5rem] px-3 py-2 text-sm"
        onClick={onSeen}
        title="Je l’ai vu — le retirer de mes likes"
      >
        Marquer vu
      </button>
      <button
        type="button"
        className="btn min-w-[6.5rem] border-[rgba(160,74,65,0.18)] bg-[rgba(249,236,233,0.7)] px-3 py-2 text-sm text-[color:var(--color-danger)]"
        onClick={onRemove}
        title="Je ne suis plus intéressé·e — le retirer de mes likes"
      >
        Retirer
      </button>
    </div>
  )
}

function UndoToast({
  toast,
  undoing,
  onUndo,
  onDismiss,
}: {
  toast: Toast | null
  undoing: boolean
  onUndo: (workId: string) => void
  onDismiss: () => void
}) {
  if (!toast) return null

  const message =
    toast.status === 'SEEN'
      ? `« ${toast.title} » marqué comme vu, retiré de tes likes`
      : `« ${toast.title} » retiré de tes likes`

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[90vw] items-center gap-4 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-strong)] px-5 py-3 shadow-[var(--shadow-lg)]"
    >
      <span className="text-sm font-medium text-[color:var(--color-text)]">{message}</span>
      <button
        type="button"
        onClick={() => onUndo(toast.workId)}
        disabled={undoing}
        className="text-sm font-semibold text-[color:var(--color-accent)] underline-offset-2 hover:underline disabled:opacity-50"
      >
        {undoing ? '…' : 'Annuler'}
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
