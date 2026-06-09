import { workDirectorLabel, workSectionLabel } from '@/features/works/section'
import WorkImage from '@/features/works/ui/WorkImage'
import SourceLink from '@/features/works/ui/SourceLink'
import type { WorkCardDto } from '@/features/works/dto'
import ExpandableDescription from '@/features/works/ui/ExpandableDescription'
import { formatAvailability, formatDuration, formatPriceRange } from '@/features/works/ui/work-formatters'

const AVAILABILITY_CHIP_CLASS: Record<'success' | 'danger' | 'warning', string> = {
  success: 'bg-[color:var(--color-success-soft)] text-[color:var(--color-success)]',
  warning: 'bg-[rgba(160,74,65,0.10)] text-[color:var(--color-danger)]',
  danger: 'bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]',
}

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
  const hasFacts = Boolean(durationLabel) || Boolean(priceLabel) || Boolean(availability) || Boolean(ratingLabel)
  // Ligne d'eyebrow : lieu + arrondissement (toutes sections « lieu » sauf le cinéma,
  // qui affiche plutôt nationalité·année).
  const venueLine = [work.venue, work.section !== 'cinema' ? work.arrondissement : null]
    .filter(Boolean)
    .join(' · ')
  const cinemaMeta = work.section === 'cinema' ? [work.country, work.year].filter(Boolean).join(' · ') : ''
  // Cinéma : « N salles — quelques noms » (un film passe dans plusieurs cinémas).
  const cinemaVenuesLine =
    work.section === 'cinema' && work.cinemaVenueCount
      ? `${work.cinemaVenueCount} salle${work.cinemaVenueCount > 1 ? 's' : ''}${
          work.cinemaVenues.length ? ' · ' + work.cinemaVenues.slice(0, 2).join(', ') : ''
        }`
      : ''
  // Infos pratiques du lieu (théâtre relié) : métro + accès.
  const venueMetro = work.venueInfo?.metro?.trim()
  const venueAccess = work.venueInfo?.access?.trim()
  // Sources : lien dédié de la fiche (porté par le titre) > site du lieu (porté par
  // le nom du lieu). Le bouton copier accompagne la source primaire disponible.
  const officialUrl = work.officialUrl
  const venueWebsite = work.venueInfo?.website ?? null

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
        {counter ? (
          <span className="absolute left-3 top-3 rounded-full border border-white/35 bg-black/35 px-3 py-1 text-xs font-medium tabular-nums text-white backdrop-blur-sm">
            {counter}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 p-4">
        <div className="space-y-1">
          {venueLine ? (
            <SourceLink
              label={venueLine}
              href={venueWebsite}
              copy={!officialUrl}
              textClassName="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]"
            />
          ) : null}
          {cinemaMeta ? (
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">
              {cinemaMeta}
            </p>
          ) : null}
          <h2
            id={`work-${work.id}-title`}
            className="text-[1.4rem] font-semibold leading-[1.05] tracking-[-0.04em] text-[color:var(--color-text)]"
          >
            {officialUrl ? (
              <SourceLink label={work.title} href={officialUrl} textClassName="text-[color:var(--color-text)]" />
            ) : (
              work.title
            )}
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

        {cinemaVenuesLine ? (
          <p className="text-xs text-[color:var(--color-text-muted)]">🎬 {cinemaVenuesLine}</p>
        ) : null}

        {work.platforms && work.platforms.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">
              📺 Dispo sur
            </span>
            {work.platforms.map((p) => (
              <span
                key={p}
                className="rounded-full bg-[rgba(54,39,24,0.06)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--color-text)]"
              >
                {p}
              </span>
            ))}
          </div>
        ) : null}

        {hasFacts ? (
          <div className="flex flex-wrap items-center gap-2">
            {ratingLabel ? (
              <span className="rounded-full bg-[rgba(212,160,23,0.16)] px-3 py-1 text-xs font-semibold text-[#7a5c00]">
                ⭐ {ratingLabel}
              </span>
            ) : null}
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

        {/* key={work.id} : le deck réutilise l'instance de carte d'un swipe à l'autre ;
            on remonte la description à chaque fiche pour repartir replié (« Voir plus »)
            et ne pas conserver l'état déplié de la fiche précédente. */}
        {description ? <ExpandableDescription key={work.id} text={description} /> : null}

        {/* Fallback Offi : seulement quand aucune source (lien dédié de la fiche ni site
            du lieu) n'est disponible — ex. cinéma, ou lieu non encore relié. */}
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
