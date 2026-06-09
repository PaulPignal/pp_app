import { workDirectorLabel, workSectionLabel } from '@/features/works/section'
import WorkImage from '@/features/works/ui/WorkImage'
import SourceLink from '@/features/works/ui/SourceLink'
import type { WorkCardDto } from '@/features/works/dto'
import ExpandableDescription from '@/features/works/ui/ExpandableDescription'
import { formatAvailability, formatDuration, formatPriceRange } from '@/features/works/ui/work-formatters'
import { IconAccess, IconClock, IconFilm, IconMetro, IconStar, IconTicket, IconTv } from '@/shared/ui/icons'

const AVAILABILITY_CHIP_CLASS: Record<'success' | 'danger' | 'warning', string> = {
  success: 'bg-[color:var(--color-success-soft)] text-[color:var(--color-success)]',
  warning: 'bg-[rgba(160,74,65,0.10)] text-[color:var(--color-danger)]',
  danger: 'bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]',
}

const FACT_CHIP = 'inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-[rgba(54,39,24,0.06)] px-2.5 py-1 text-xs font-medium text-[color:var(--color-text)]'

export default function CardWork({ work, counter }: { work: WorkCardDto; counter?: string }) {
  const durationLabel = formatDuration(work.durationMin)
  const priceLabel = formatPriceRange(work.priceMin, work.priceMax)
  const availability = formatAvailability(work.availability)
  const description = work.description?.trim()
  const sectionLabel = workSectionLabel(work.section)
  const directorLabel = workDirectorLabel(work.section)
  // Note publique (films) : affichée si ≥ 20 votes (sinon trop bruitée).
  const ratingLabel =
    work.rating != null && work.rating > 0 && (work.ratingCount ?? 0) >= 20
      ? work.rating.toFixed(1).replace('.', ',')
      : null
  const hasFacts = Boolean(durationLabel) || Boolean(priceLabel) || Boolean(availability)
  // Sous-titre sur l'affiche : nationalité·année (ciné) sinon lieu + arrondissement.
  const venueLine = [work.venue, work.section !== 'cinema' ? work.arrondissement : null].filter(Boolean).join(' · ')
  const cinemaMeta = work.section === 'cinema' ? [work.country, work.year].filter(Boolean).join(' · ') : ''
  const cinemaVenuesLine =
    work.section === 'cinema' && work.cinemaVenueCount
      ? `${work.cinemaVenueCount} salle${work.cinemaVenueCount > 1 ? 's' : ''}${
          work.cinemaVenues.length ? ' · ' + work.cinemaVenues.slice(0, 2).join(', ') : ''
        }`
      : ''
  const venueMetro = work.venueInfo?.metro?.trim()
  const venueAccess = work.venueInfo?.access?.trim()
  // Sources : lien dédié de la fiche (sur le titre) > site du lieu (sur le lieu).
  const officialUrl = work.officialUrl
  const venueWebsite = work.venueInfo?.website ?? null

  return (
    <article
      className="flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-xl)] bg-[color:var(--color-surface-strong)] outline-none"
      tabIndex={-1}
      aria-describedby={`work-${work.id}-title`}
    >
      {/* Affiche dominante + surimpression (titre, note, section). */}
      <div className="relative min-h-[20rem] flex-1 overflow-hidden">
        <WorkImage
          src={work.imageUrl}
          alt={work.title}
          sizes="(max-width: 768px) 100vw, 480px"
          className="object-cover"
          priority
          fallback={
            <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#ffffff14,transparent_55%)] text-sm text-[color:var(--color-text-muted)]">
              Aucune image
            </div>
          }
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

        {counter ? (
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium tabular-nums text-white/90 backdrop-blur-sm">
            {counter}
          </span>
        ) : null}
        <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/90 backdrop-blur-sm">
          {sectionLabel}
        </span>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4">
          {ratingLabel ? (
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-[#7a5c00] backdrop-blur-sm">
              <IconStar size={13} /> {ratingLabel}
            </span>
          ) : null}
          <h2
            id={`work-${work.id}-title`}
            className="text-[1.55rem] font-semibold leading-[1.04] tracking-[-0.03em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]"
          >
            {officialUrl ? (
              <SourceLink label={work.title} href={officialUrl} textClassName="text-white" />
            ) : (
              work.title
            )}
          </h2>
          {cinemaMeta ? (
            <p className="text-sm font-medium text-white/75">{cinemaMeta}</p>
          ) : venueLine ? (
            <SourceLink label={venueLine} href={venueWebsite} copy={!officialUrl} textClassName="text-sm font-medium text-white/75" />
          ) : null}
        </div>
      </div>

      {/* Bandeau d'infos sous l'affiche. */}
      <div className="flex flex-col gap-2.5 p-4">
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
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[color:var(--color-text-muted)]">
            {venueMetro ? (
              <span className="inline-flex items-center gap-1.5">
                <IconMetro size={14} /> {venueMetro}
              </span>
            ) : null}
            {venueAccess ? (
              <span className="inline-flex items-center gap-1.5">
                <IconAccess size={14} /> {venueAccess}
              </span>
            ) : null}
          </p>
        ) : null}

        {cinemaVenuesLine ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-[color:var(--color-text-muted)]">
            <IconFilm size={14} /> {cinemaVenuesLine}
          </p>
        ) : null}

        {work.platforms && work.platforms.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">
              <IconTv size={14} /> Dispo sur
            </span>
            {work.platforms.map((p) => (
              <span key={p} className="rounded-full bg-[rgba(54,39,24,0.06)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--color-text)]">
                {p}
              </span>
            ))}
          </div>
        ) : null}

        {hasFacts ? (
          <div className="flex flex-wrap items-center gap-2">
            {durationLabel ? (
              <span className={FACT_CHIP}>
                <IconClock size={13} /> {durationLabel}
              </span>
            ) : null}
            {priceLabel ? (
              <span className={FACT_CHIP}>
                <IconTicket size={13} /> {priceLabel}
              </span>
            ) : null}
            {availability ? (
              <span className={`rounded-[var(--radius-control)] px-2.5 py-1 text-xs font-semibold ${AVAILABILITY_CHIP_CLASS[availability.tone]}`}>
                {availability.label}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* key={work.id} : le deck réutilise l'instance de carte d'un swipe à l'autre ;
            on remonte la description à chaque fiche pour repartir replié (« Voir plus »). */}
        {description ? <ExpandableDescription key={work.id} text={description} /> : null}

        {/* Fallback Offi : seulement quand aucune source (lien dédié ni site du lieu). */}
        {work.sourceUrl && !officialUrl && !venueWebsite ? (
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
