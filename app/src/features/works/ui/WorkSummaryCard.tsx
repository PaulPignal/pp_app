import type { ReactNode } from 'react'
import type { WorkCardDto } from '@/features/works/dto'
import { workDirectorLabel, workSectionLabel } from '@/features/works/section'
import BadgeCategory from '@/features/works/ui/BadgeCategory'
import WorkImage from '@/features/works/ui/WorkImage'
import SourceLink from '@/features/works/ui/SourceLink'
import { IconTv } from '@/shared/ui/icons'
import { formatDateRange, formatDuration, formatPriceRange } from '@/features/works/ui/work-formatters'
import { cn } from '@/shared/lib/cn'
import SurfaceCard from '@/shared/ui/SurfaceCard'

type WorkSummaryCardProps = {
  work: WorkCardDto | null
  fallbackTitle: string
  actions?: ReactNode
  className?: string
}

export default function WorkSummaryCard({ work, fallbackTitle, actions, className }: WorkSummaryCardProps) {
  const title = work?.title ?? fallbackTitle
  const dateLabel = work ? formatDateRange(work.startDate, work.endDate) : null
  const priceLabel = work ? formatPriceRange(work.priceMin, work.priceMax) : null
  const durationLabel = work ? formatDuration(work.durationMin) : null
  const ratingLabel =
    work?.rating != null && work.rating > 0 && (work.ratingCount ?? 0) >= 20
      ? work.rating.toFixed(1).replace('.', ',')
      : null
  const description = work?.description?.trim()
  const director = work?.director?.trim()
  const castNames = work?.cast?.slice(0, 5) ?? []
  const directorLabel = workDirectorLabel(work?.section)
  const venueLine = work
    ? [work.venue, work.section !== 'cinema' ? work.arrondissement : null].filter(Boolean).join(' · ')
    : ''
  const cinemaMeta = work?.section === 'cinema' ? [work.country, work.year].filter(Boolean).join(' · ') : ''
  // Sources : lien dédié de la fiche (sur le titre) > site du lieu (sur le nom du lieu).
  const officialUrl = work?.officialUrl ?? null
  const venueWebsite = work?.venueInfo?.website ?? null
  const cinemaVenuesLine =
    work?.section === 'cinema' && work.cinemaVenueCount
      ? `${work.cinemaVenueCount} salle${work.cinemaVenueCount > 1 ? 's' : ''}${
          work.cinemaVenues.length ? ' · ' + work.cinemaVenues.slice(0, 3).join(', ') : ''
        }`
      : ''

  return (
    <SurfaceCard className={cn('flex h-full flex-col overflow-hidden p-0', className)} tone="muted">
      <div className="relative h-48 w-full overflow-hidden bg-muted">
        <WorkImage
          src={work?.imageUrl}
          alt={title}
          sizes="(max-width: 768px) 100vw, 420px"
          className="object-cover"
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Pas d&apos;image</div>
          }
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent" />

        <div className="absolute left-4 top-4">
          {work?.category ? <BadgeCategory category={work.category} /> : null}
        </div>

        {work?.section ? (
          <span className="absolute bottom-4 right-4 rounded-full border border-white/35 bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-white backdrop-blur-sm">
            {workSectionLabel(work.section)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="space-y-2">
          <h3 className="line-clamp-2 text-lg font-semibold tracking-[-0.03em] text-[color:var(--color-text)]">
            {officialUrl ? (
              <SourceLink label={title} href={officialUrl} textClassName="text-[color:var(--color-text)]" />
            ) : (
              title
            )}
          </h3>
          {venueLine ? (
            <SourceLink
              label={venueLine}
              href={venueWebsite}
              copy={!officialUrl}
              textClassName="text-sm font-medium text-muted-foreground"
            />
          ) : null}
          {cinemaMeta ? <p className="text-sm font-medium text-muted-foreground">{cinemaMeta}</p> : null}
          {cinemaVenuesLine ? <p className="text-sm text-muted-foreground">{cinemaVenuesLine}</p> : null}
          {work?.platforms && work.platforms.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <IconTv size={14} /> Dispo sur
              </span>
              {work.platforms.map((p) => (
                <span key={p} className="rounded-full bg-[color:var(--color-fill)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--color-text)]">
                  {p}
                </span>
              ))}
            </div>
          ) : null}
          {director || castNames.length > 0 ? (
            <div className="space-y-0.5 text-sm leading-6">
              {director ? (
                <p>
                  <span className="text-muted-foreground">{directorLabel} </span>
                  <span className="font-semibold text-[color:var(--color-text)]">{director}</span>
                </p>
              ) : null}
              {castNames.length > 0 ? (
                <p>
                  <span className="text-muted-foreground">Avec </span>
                  <span className="font-medium text-[color:var(--color-text)]">{castNames.join(', ')}</span>
                </p>
              ) : null}
            </div>
          ) : null}
          {description ? <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>

        <div className="grid gap-2 text-sm text-[color:var(--color-text)]">
          {ratingLabel ? <SummaryRow label="Note" value={`${ratingLabel} / 10`} /> : null}
          {dateLabel ? <SummaryRow label="Dates" value={dateLabel} /> : null}
          {priceLabel ? <SummaryRow label="Budget" value={priceLabel} /> : null}
          {durationLabel ? <SummaryRow label="Durée" value={durationLabel} /> : null}
          {work?.address ? <SummaryRow label="Adresse" value={work.address} /> : null}
        </div>

        <div className="mt-auto flex flex-col gap-3 border-t border-[color:var(--color-border)] pt-4">
          {/* Fallback Offi : uniquement si aucune source (lien dédié de la fiche ni site
              du lieu) n'est disponible. */}
          {work?.sourceUrl && !officialUrl && !venueWebsite ? (
            <a
              href={work.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-[color:var(--color-accent)] transition hover:underline"
            >
              Voir sur Offi.fr ↗
            </a>
          ) : null}

          {actions}
        </div>
      </div>
    </SurfaceCard>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[var(--radius-panel)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2">
      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <span className="text-right font-medium leading-6">{value}</span>
    </div>
  )
}
