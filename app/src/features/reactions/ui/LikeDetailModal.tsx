'use client'

import { useEffect, useRef } from 'react'
import type { FriendSummaryDto } from '@/features/friendships/dto'
import type { WorkCardDto } from '@/features/works/dto'
import WorkSummaryCard from '@/features/works/ui/WorkSummaryCard'
import { formatAvailability } from '@/features/works/ui/work-formatters'

export type LikeBucket = 'like' | 'seen'

type Props = {
  work: WorkCardDto | null
  fallbackTitle: string
  friends: FriendSummaryDto[]
  bucket: LikeBucket
  onClose: () => void
  onSeen: () => void
  onRemove: () => void
}

function mapsUrl(work: WorkCardDto) {
  const query = [work.venue, work.address, work.arrondissement, 'Paris'].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export default function LikeDetailModal({ work, fallbackTitle, friends, bucket, onClose, onSeen, onRemove }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  // Fermeture au clavier (Échap) + focus initial sur le bouton fermer.
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const title = work?.title ?? fallbackTitle
  const availability = formatAvailability(work?.availability ?? null)
  const soldOut = work?.availability === 'SoldOut' || work?.availability === 'OutOfStock'
  const isStreaming = work?.section === 'streaming'
  // CTA : « Où regarder » (streaming, vers la page where-to-watch) sinon réservation Offi.
  const ctaHref = isStreaming ? work?.officialUrl ?? work?.sourceUrl ?? null : work?.sourceUrl ?? null
  const ctaLabel = isStreaming
    ? 'Où regarder ↗'
    : soldOut
      ? 'Complet — voir sur Offi.fr ↗'
      : availability
        ? 'Réserver des billets ↗'
        : 'Voir sur Offi.fr ↗'
  const venueMetro = work?.venueInfo?.metro?.trim()
  const venueAccess = work?.venueInfo?.access?.trim()
  const venuePhone = work?.venueInfo?.phone?.trim()

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Détail : ${title}`}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[var(--radius-2xl)] bg-[color:var(--color-page)] p-4 shadow-[var(--shadow-lg)] sm:rounded-[var(--radius-2xl)]"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="chip">{bucket === 'seen' ? 'Déjà vu' : 'Dans mes likes'}</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="btn btn-ghost px-3 py-1.5 text-sm"
          >
            ✕ Fermer
          </button>
        </div>

        <WorkSummaryCard
          work={work}
          fallbackTitle={fallbackTitle}
          actions={
            <div className="space-y-4">
              {/* Infos pratiques (lieu relié) */}
              {venueMetro || venueAccess || venuePhone ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--color-text-muted)]">
                  {venueMetro ? <span>🚇 {venueMetro}</span> : null}
                  {venueAccess ? <span>♿ {venueAccess}</span> : null}
                  {venuePhone ? <span>📞 {venuePhone}</span> : null}
                </div>
              ) : null}

              {/* Amis qui aiment aussi */}
              {friends.length > 0 ? (
                <p className="text-sm text-[color:var(--color-text)]">
                  <span aria-hidden>👥 </span>
                  <span className="text-muted-foreground">Aimé aussi par </span>
                  <span className="font-medium">{friends.map((f) => f.email.split('@')[0]).join(', ')}</span>
                </p>
              ) : null}

              {/* Réserver / Où regarder */}
              {ctaHref ? (
                <a
                  href={ctaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`btn ${soldOut && !isStreaming ? 'btn-secondary' : 'btn-primary'} w-full justify-center`}
                  aria-disabled={(soldOut && !isStreaming) || undefined}
                >
                  {ctaLabel}
                </a>
              ) : null}

              {work ? (
                <a
                  href={mapsUrl(work)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs font-medium text-[color:var(--color-text-muted)] underline-offset-4 hover:text-[color:var(--color-accent)] hover:underline"
                >
                  📍 Itinéraire
                </a>
              ) : null}

              {/* Actions bibliothèque */}
              <div className="flex flex-wrap gap-2 border-t border-[color:var(--color-border)] pt-3">
                {bucket === 'like' ? (
                  <button type="button" className="btn btn-secondary flex-1 px-3 py-2 text-sm" onClick={onSeen}>
                    Marquer vu
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost flex-1 px-3 py-2 text-sm text-[color:var(--color-danger)]"
                  onClick={onRemove}
                >
                  Retirer
                </button>
              </div>
            </div>
          }
        />
      </div>
    </div>
  )
}
