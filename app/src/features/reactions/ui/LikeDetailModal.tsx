'use client'

import { useEffect, useId, useRef } from 'react'
import type { FriendLikerDto } from '@/features/friendships/dto'
import type { WorkCardDto } from '@/features/works/dto'
import WorkSummaryCard from '@/features/works/ui/WorkSummaryCard'
import { IconArrowUpRight, IconPin, IconUsers, IconX } from '@/shared/ui/icons'
import { formatAvailability } from '@/features/works/ui/work-formatters'

export type LikeBucket = 'like' | 'seen'

type Props = {
  work: WorkCardDto | null
  fallbackTitle: string
  friends: FriendLikerDto[]
  bucket: LikeBucket
  onClose: () => void
  onSeen: () => void
  onRemove: () => void
}

function mapsUrl(work: WorkCardDto) {
  const query = [work.venue, work.address, work.arrondissement, 'Paris'].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

export default function LikeDetailModal({ work, fallbackTitle, friends, bucket, onClose, onSeen, onRemove }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  // Focus initial sur « Fermer », Échap pour fermer, tabulation retenue dans la boîte,
  // défilement de la page bloqué, puis retour du focus à l'élément déclencheur.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      opener?.focus?.()
    }
  }, [onClose])

  const availability = formatAvailability(work?.availability ?? null)
  const soldOut = work?.availability === 'SoldOut' || work?.availability === 'OutOfStock'
  const isStreaming = work?.section === 'streaming'
  // CTA : « Où regarder » (streaming, vers la page where-to-watch) sinon réservation Offi.
  const ctaHref = isStreaming ? (work?.officialUrl ?? work?.sourceUrl ?? null) : (work?.sourceUrl ?? null)
  const ctaLabel = isStreaming ? 'Où regarder' : soldOut ? 'Complet, voir sur Offi.fr' : availability ? 'Réserver des billets' : 'Voir sur Offi.fr'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center sm:p-6"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-xl border border-line bg-page shadow-float sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2 sm:px-5">
          <span className="eyebrow">{bucket === 'seen' ? 'Déjà vu' : 'Dans mes likes'}</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fermer" className="btn-icon -mr-2">
            <IconX size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">
          <WorkSummaryCard work={work} fallbackTitle={fallbackTitle} titleId={titleId}>
            {friends.length > 0 ? (
              <p className="inline-flex items-center gap-1.5 text-sm text-ink">
                <IconUsers size={15} className="text-ink-muted" />
                <span className="text-ink-muted">Aimé aussi par </span>
                <span className="font-semibold">{friends.map((f) => f.name).join(', ')}</span>
              </p>
            ) : null}

            <div className="flex flex-col gap-2 border-t border-line pt-4">
              {work && !isStreaming && (work.venue || work.address) ? (
                <a href={mapsUrl(work)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary w-full">
                  <IconPin size={16} /> Itinéraire
                </a>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {bucket === 'like' ? (
                  <button type="button" className="btn flex-1" onClick={onSeen}>
                    Marquer comme vu
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost flex-1 text-danger hover:text-danger" onClick={onRemove}>
                  Retirer
                </button>
              </div>
            </div>
          </WorkSummaryCard>
        </div>

        {/* Action principale toujours visible, hors de la zone qui défile. */}
        {ctaHref ? (
          <div className="shrink-0 border-t border-line bg-page px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <a
              href={ctaHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`btn w-full ${soldOut && !isStreaming ? 'btn-secondary' : 'btn-primary'}`}
            >
              {ctaLabel}
              <IconArrowUpRight size={16} />
            </a>
          </div>
        ) : null}
      </div>
    </div>
  )
}
