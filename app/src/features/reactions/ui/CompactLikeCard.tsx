'use client'

import type { FriendSummaryDto } from '@/features/friendships/dto'
import type { WorkCardDto } from '@/features/works/dto'
import { isWorkCurrentlyShowing } from '@/features/works/availability'
import { workSectionLabel } from '@/features/works/section'
import WorkImage from '@/features/works/ui/WorkImage'
import { formatAvailability, formatDateRange, formatEndsIn, formatPriceRange } from '@/features/works/ui/work-formatters'
import { IconClock, IconImage, IconUsers, IconX } from '@/shared/ui/icons'

// Prénom lisible à partir d'un email (« lea.martin@… » → « Lea »).
export function friendDisplayName(email: string) {
  const local = (email.split('@')[0] ?? email).split(/[._-]/)[0] ?? email
  return local.charAt(0).toUpperCase() + local.slice(1, 14)
}

const AVAILABILITY_CHIP: Record<'success' | 'danger' | 'warning', string> = {
  success: 'chip chip-success',
  danger: 'chip chip-danger',
  warning: 'chip chip-accent',
}

type Props = {
  work: WorkCardDto | null
  fallbackTitle: string
  friends: FriendSummaryDto[]
  /** Ouvre le détail (la carte entière devient un bouton). Absent : carte en lecture seule. */
  onOpen?: () => void
  /** Retire l'œuvre (croix en haut à droite). Absent : pas de croix. */
  onRemove?: () => void
}

// Ligne compacte d'une œuvre : vignette, section, titre, lieu, signaux utiles
// (échéance, disponibilité, amis). Même composant pour Mes likes et les œuvres communes.
export default function CompactLikeCard({ work, fallbackTitle, friends, onOpen, onRemove }: Props) {
  const title = work?.title ?? fallbackTitle
  const sectionLabel = workSectionLabel(work?.section)
  const ends = formatEndsIn(work?.endDate ?? null)
  const ended = work?.endDate ? !isWorkCurrentlyShowing(work.endDate) : false
  const endedLabel = ended ? formatDateRange(null, work?.endDate ?? null) : null
  const availability = ended ? null : formatAvailability(work?.availability ?? null)
  const priceLabel = formatPriceRange(work?.priceMin ?? null, work?.priceMax ?? null)
  const metaLine =
    work?.section === 'cinema'
      ? [work?.country, work?.year].filter(Boolean).join(' · ')
      : [work?.venue, work?.arrondissement].filter(Boolean).join(' · ')
  const friendsLabel = friends.length === 1 ? friendDisplayName(friends[0].email) : friends.length > 1 ? `${friends.length} amis` : null

  return (
    <article className="card relative flex gap-3 p-3 transition-colors duration-150 hover:border-line-strong">
      {onOpen ? (
        <button type="button" onClick={onOpen} className="absolute inset-0 rounded-lg" aria-label={`Voir le détail de ${title}`} />
      ) : null}

      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-fill">
        <WorkImage
          src={work?.imageUrl}
          alt=""
          sizes="80px"
          className="object-cover"
          fallback={
            <div className="flex h-full items-center justify-center text-ink-muted">
              <IconImage size={20} />
            </div>
          }
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5 pr-8">
        <p className="eyebrow truncate">
          {sectionLabel}
          {priceLabel ? <span className="normal-case tracking-normal"> · {priceLabel}</span> : null}
        </p>
        <h3 className="display line-clamp-2 text-lg text-ink">{title}</h3>
        {metaLine ? <p className="truncate text-sm text-ink-muted">{metaLine}</p> : null}

        {ends || endedLabel || availability || friendsLabel ? (
          <ul className="mt-1 flex flex-wrap items-center gap-1.5">
            {ends ? (
              <li className={ends.urgent ? 'chip chip-accent' : 'chip'}>
                <IconClock size={12} />
                {ends.label}
              </li>
            ) : null}
            {endedLabel ? <li className="text-xs text-ink-muted">Terminé le {endedLabel}</li> : null}
            {availability ? <li className={AVAILABILITY_CHIP[availability.tone]}>{availability.label}</li> : null}
            {friendsLabel ? (
              <li className="chip chip-accent" title={friends.map((f) => f.email).join(', ')}>
                <IconUsers size={12} />
                <span className="sr-only">Aimé aussi par </span>
                {friendsLabel}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Retirer « ${title} » des likes`}
          className="btn-icon absolute right-1 top-1 z-10 hover:bg-danger-soft hover:text-danger"
        >
          <IconX size={16} />
        </button>
      ) : null}
    </article>
  )
}
