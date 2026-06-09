'use client'

import type { FriendSummaryDto } from '@/features/friendships/dto'
import type { WorkCardDto } from '@/features/works/dto'
import { workSectionLabel } from '@/features/works/section'
import WorkImage from '@/features/works/ui/WorkImage'
import { formatAvailability, formatEndsIn, formatPriceRange } from '@/features/works/ui/work-formatters'
import { IconUsers } from '@/shared/ui/icons'

function initials(email: string) {
  return (email.split('@')[0] ?? email).slice(0, 2).toUpperCase()
}

type Props = {
  work: WorkCardDto | null
  fallbackTitle: string
  friends: FriendSummaryDto[]
  onOpen: () => void
}

// Carte compacte et cliquable (le détail s'ouvre dans une modale). Vignette à
// gauche, titre + signaux d'action à droite (urgence, dispo, prix, amis).
export default function CompactLikeCard({ work, fallbackTitle, friends, onOpen }: Props) {
  const title = work?.title ?? fallbackTitle
  const sectionLabel = workSectionLabel(work?.section)
  const ends = formatEndsIn(work?.endDate ?? null)
  const availability = formatAvailability(work?.availability ?? null)
  const priceLabel = formatPriceRange(work?.priceMin ?? null, work?.priceMax ?? null)
  const metaLine =
    work?.section === 'cinema'
      ? [work?.country, work?.year].filter(Boolean).join(' · ')
      : [work?.venue, work?.arrondissement].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-stretch gap-3 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-strong)] p-2 text-left transition hover:border-[color:var(--color-border-strong)] hover:shadow-[var(--shadow-sm)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]"
      aria-label={`Voir le détail de ${title}`}
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-muted">
        <WorkImage
          src={work?.imageUrl}
          alt=""
          sizes="80px"
          className="object-cover"
          fallback={<div className="flex h-full items-center justify-center text-[0.65rem] text-muted-foreground">—</div>}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5 pr-1">
        <div className="flex items-center gap-2">
          <span className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-text-muted)]">
            {sectionLabel}
          </span>
          {priceLabel ? <span className="text-[0.62rem] text-[color:var(--color-text-muted)]">· {priceLabel}</span> : null}
        </div>

        <h3 className="line-clamp-2 text-sm font-semibold leading-tight tracking-[-0.02em] text-[color:var(--color-text)]">
          {title}
        </h3>

        {metaLine ? <p className="truncate text-xs text-[color:var(--color-text-muted)]">{metaLine}</p> : null}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {ends ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${
                ends.urgent
                  ? 'bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]'
                  : 'bg-[rgba(255,255,255,0.07)] text-[color:var(--color-text)]'
              }`}
            >
              ⏳ {ends.label}
            </span>
          ) : null}
          {availability ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${
                availability.tone === 'success'
                  ? 'bg-[color:var(--color-success-soft)] text-[color:var(--color-success)]'
                  : 'bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]'
              }`}
            >
              {availability.label}
            </span>
          ) : null}
          {friends.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(242,92,84,0.16)] px-2 py-0.5 text-[0.62rem] font-semibold text-[color:var(--color-accent)]">
              <IconUsers size={11} />
              {friends.length === 1 ? initials(friends[0].email) : `${friends.length} amis`}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
}
