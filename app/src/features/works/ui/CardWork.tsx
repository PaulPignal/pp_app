import { splitGenres } from '@/features/works/category'
import { workDirectorLabel, workSectionLabel } from '@/features/works/section'
import WorkImage from '@/features/works/ui/WorkImage'
import type { WorkCardDto } from '@/features/works/dto'
import ExpandableDescription from '@/features/works/ui/ExpandableDescription'
import { formatAvailability, formatDuration, formatPriceRange } from '@/features/works/ui/work-formatters'

const AVAILABILITY_CHIP_CLASS: Record<'success' | 'danger' | 'warning', string> = {
  success: 'bg-[color:var(--color-success-soft)] text-[color:var(--color-success)]',
  warning: 'bg-[rgba(160,74,65,0.10)] text-[color:var(--color-danger)]',
  danger: 'bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]',
}

export default function CardWork({ work }: { work: WorkCardDto }) {
  const durationLabel = formatDuration(work.durationMin)
  const priceLabel = formatPriceRange(work.priceMin, work.priceMax)
  const availability = formatAvailability(work.availability)
  const description = work.description?.trim()
  const genres = splitGenres(work.category).slice(0, 3)
  const sectionLabel = workSectionLabel(work.section)
  const directorLabel = workDirectorLabel(work.section)
  const hasFacts =
    genres.length > 0 || Boolean(durationLabel) || Boolean(priceLabel) || Boolean(availability)
  // Ligne d'eyebrow : lieu + arrondissement (toutes sections « lieu » sauf le cinéma,
  // qui affiche plutôt nationalité·année).
  const venueLine = [work.venue, work.section !== 'cinema' ? work.arrondissement : null]
    .filter(Boolean)
    .join(' · ')
  const cinemaMeta = work.section === 'cinema' ? [work.country, work.year].filter(Boolean).join(' · ') : ''
  // Infos pratiques du lieu (théâtre relié) : métro + accès.
  const venueMetro = work.venueInfo?.metro?.trim()
  const venueAccess = work.venueInfo?.access?.trim()

  return (
    <article
      className="flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-xl)] bg-[color:var(--color-surface-strong)] outline-none"
      tabIndex={-1}
      aria-describedby={`work-${work.id}-title`}
    >
      <div className="relative min-h-[14rem] flex-1 overflow-hidden rounded-[var(--radius-xl)] bg-muted">
        <WorkImage
          src={work.imageUrl}
          alt={work.title}
          sizes="(max-width: 768px) 100vw, 480px"
          className="object-cover"
          priority
          fallback={
            <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#fff3,transparent_55%)] text-sm text-muted-foreground">
              Aucune image
            </div>
          }
        />

        <span className="absolute right-3 top-3 rounded-full border border-white/35 bg-black/35 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-white backdrop-blur-sm">
          {sectionLabel}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-5">
        <div className="space-y-1.5">
          {venueLine ? (
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">
              📍 {venueLine}
            </p>
          ) : null}
          {cinemaMeta ? (
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">
              {cinemaMeta}
            </p>
          ) : null}
          <h2
            id={`work-${work.id}-title`}
            className="text-[1.6rem] font-semibold leading-[1.05] tracking-[-0.04em] text-[color:var(--color-text)]"
          >
            {work.title}
          </h2>
        </div>

        {work.director || work.cast.length > 0 ? (
          <div className="space-y-0.5 text-sm leading-6">
            {work.director ? (
              <p>
                <span className="text-[color:var(--color-text-muted)]">{directorLabel} </span>
                <span className="font-semibold text-[color:var(--color-text)]">{work.director}</span>
              </p>
            ) : null}
            {work.cast.length > 0 ? (
              <p>
                <span className="text-[color:var(--color-text-muted)]">Avec </span>
                <span className="font-medium text-[color:var(--color-text)]">{work.cast.slice(0, 5).join(', ')}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {venueMetro || venueAccess ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--color-text-muted)]">
            {venueMetro ? <span>🚇 {venueMetro}</span> : null}
            {venueAccess ? <span>♿ {venueAccess}</span> : null}
          </p>
        ) : null}

        {hasFacts ? (
          <div className="flex flex-wrap items-center gap-2">
            {genres.map((genre) => (
              <span
                key={genre}
                className="rounded-full border border-[color:var(--color-border)] bg-white/70 px-3 py-1 text-xs font-semibold capitalize text-[color:var(--color-text)]"
              >
                {genre}
              </span>
            ))}
            {durationLabel ? (
              <span className="rounded-full bg-[rgba(54,39,24,0.06)] px-3 py-1 text-xs font-medium text-[color:var(--color-text)]">
                ⏱️ {durationLabel}
              </span>
            ) : null}
            {priceLabel ? (
              <span className="rounded-full bg-[rgba(54,39,24,0.06)] px-3 py-1 text-xs font-medium text-[color:var(--color-text)]">
                💶 {priceLabel}
              </span>
            ) : null}
            {availability ? (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${AVAILABILITY_CHIP_CLASS[availability.tone]}`}>
                {availability.label}
              </span>
            ) : null}
          </div>
        ) : null}

        {description ? <ExpandableDescription text={description} /> : null}

        {work.sourceUrl ? (
          <a
            href={work.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex w-fit items-center gap-1 text-xs font-medium text-[color:var(--color-text-muted)] underline-offset-4 transition hover:text-[color:var(--color-accent)] hover:underline"
          >
            Voir sur Offi.fr <span aria-hidden>↗</span>
          </a>
        ) : null}
      </div>
    </article>
  )
}
