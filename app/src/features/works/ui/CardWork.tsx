import { workDirectorLabel } from '@/features/works/section'
import WorkImage from '@/features/works/ui/WorkImage'
import SourceLink from '@/features/works/ui/SourceLink'
import type { WorkCardDto } from '@/features/works/dto'
import ExpandableDescription from '@/features/works/ui/ExpandableDescription'
import { formatAvailability, formatDuration, formatPriceRange, formatRating } from '@/features/works/ui/work-formatters'
import { IconAccess, IconClock, IconFilm, IconImage, IconMetro, IconStar, IconTicket, IconTv } from '@/shared/ui/icons'

const AVAILABILITY_CHIP_CLASS: Record<'success' | 'danger' | 'warning', string> = {
  success: 'chip chip-success',
  warning: 'chip chip-accent',
  danger: 'chip chip-danger',
}

type Props = {
  work: WorkCardDto
  /** Position dans la pile (« 3 / 28 »). */
  counter?: string
  /** Image prioritaire (carte visible) ou non (carte suivante, préchargée). */
  priority?: boolean
}

// Carte de découverte : affiche dominante avec titre, puis les faits utiles pour
// décider (crédits, accès, durée, tarif, disponibilité, description).
export default function CardWork({ work, counter, priority = true }: Props) {
  const durationLabel = formatDuration(work.durationMin)
  const priceLabel = formatPriceRange(work.priceMin, work.priceMax)
  const availability = formatAvailability(work.availability)
  const ratingLabel = formatRating(work.rating, work.ratingCount)
  // Description : celle du site du lieu par défaut, sinon celle d'Offi.
  const description = (work.venueDescription ?? work.description)?.trim()
  const directorLabel = workDirectorLabel(work.section)
  const isCinema = work.section === 'cinema'
  // Sous-titre sur l'affiche : nationalité · année (ciné) sinon lieu · arrondissement.
  const venueLine = [work.venue, !isCinema ? work.arrondissement : null].filter(Boolean).join(' · ')
  const cinemaMeta = isCinema ? [work.country, work.year].filter(Boolean).join(' · ') : ''
  const cinemaVenuesLine =
    isCinema && work.cinemaVenueCount
      ? `${work.cinemaVenueCount} salle${work.cinemaVenueCount > 1 ? 's' : ''}${
          work.cinemaVenues.length ? ' · ' + work.cinemaVenues.slice(0, 2).join(', ') : ''
        }`
      : ''
  const venueMetro = work.venueInfo?.metro?.trim()
  const venueAccess = work.venueInfo?.access?.trim()
  // Titre → page événement du lieu si on l'a, sinon lien rel=external d'Offi.
  // Nom du lieu → site officiel du lieu.
  const officialUrl = work.officialUrl ?? work.externalUrl
  const venueWebsite = work.venueInfo?.website ?? null
  const titleId = `work-${work.id}-title`

  return (
    <article className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-surface">
      {/* Affiche + surimpression. Le voile sombre en bas est fonctionnel : il garantit
          la lisibilité du titre blanc quelle que soit l'image, même quand l'affiche porte
          son propre texte. Sur mobile, la hauteur suit l'écran (100svh moins 31rem) : les
          faits (crédits, métro, durée, tarif) tiennent au-dessus de la barre d'actions. */}
      <div className="relative aspect-[4/5] max-h-[max(12rem,calc(100svh-31rem))] w-full overflow-hidden bg-fill sm:aspect-[3/2] sm:max-h-[28rem]">
        <WorkImage
          src={work.imageUrl}
          alt=""
          sizes="(max-width: 640px) 100vw, 576px"
          className="object-cover"
          priority={priority}
          fallback={
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-ink-muted">
              <IconImage size={28} />
              Pas d’image
            </div>
          }
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/95 via-black/75 via-40% to-transparent" />

        {counter ? (
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
            <span className="sr-only">Carte </span>
            {counter}
          </span>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 [text-shadow:0_1px_10px_rgb(0_0_0/0.8)] sm:p-5">
          {ratingLabel ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-white/90">
              <IconStar size={12} />
              <span className="sr-only">Note </span>
              {ratingLabel}
            </span>
          ) : null}
          <h2 id={titleId} className="display text-2xl text-white sm:text-3xl">
            {officialUrl ? <SourceLink label={work.title} href={officialUrl} textClassName="text-white" /> : work.title}
          </h2>
          {cinemaMeta ? (
            <p className="text-sm font-medium text-white/85">{cinemaMeta}</p>
          ) : venueLine ? (
            <SourceLink label={venueLine} href={venueWebsite} copy={!officialUrl} textClassName="text-sm font-medium text-white/85" />
          ) : null}
        </div>
      </div>

      {/* Faits utiles sous l'affiche. */}
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {work.director || work.cast.length > 0 ? (
          <div className="text-sm leading-6">
            {work.director ? (
              <p>
                <span className="text-ink-muted">{directorLabel} </span>
                <span className="font-semibold text-ink">{work.director}</span>
              </p>
            ) : null}
            {work.cast.length > 0 ? (
              <p>
                <span className="text-ink-muted">Avec </span>
                <span className="text-ink">{work.cast.slice(0, 5).join(', ')}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {venueMetro || venueAccess || cinemaVenuesLine ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            {venueMetro ? (
              <li className="inline-flex items-center gap-1.5">
                <IconMetro size={15} />
                <span className="sr-only">Métro </span>
                {venueMetro}
              </li>
            ) : null}
            {venueAccess ? (
              <li className="inline-flex items-center gap-1.5">
                <IconAccess size={15} />
                <span className="sr-only">Accès </span>
                {venueAccess}
              </li>
            ) : null}
            {cinemaVenuesLine ? (
              <li className="inline-flex items-center gap-1.5">
                <IconFilm size={15} />
                {cinemaVenuesLine}
              </li>
            ) : null}
          </ul>
        ) : null}

        {work.platforms && work.platforms.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
              <IconTv size={15} /> Disponible sur
            </span>
            {work.platforms.map((p) => (
              <span key={p} className="chip">
                {p}
              </span>
            ))}
          </div>
        ) : null}

        {durationLabel || priceLabel || availability ? (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink">
            {durationLabel ? (
              <li className="inline-flex items-center gap-1.5">
                <IconClock size={15} className="text-ink-muted" />
                <span className="sr-only">Durée </span>
                {durationLabel}
              </li>
            ) : null}
            {priceLabel ? (
              <li className="inline-flex items-center gap-1.5">
                <IconTicket size={15} className="text-ink-muted" />
                <span className="sr-only">Tarif </span>
                {priceLabel}
              </li>
            ) : null}
            {availability ? (
              <li>
                <span className={AVAILABILITY_CHIP_CLASS[availability.tone]}>{availability.label}</span>
              </li>
            ) : null}
          </ul>
        ) : null}

        {/* key={work.id} : le deck réutilise l'instance de carte d'un swipe à l'autre ;
            on remonte la description à chaque fiche pour repartir replié (« Voir plus »). */}
        {description ? <ExpandableDescription key={work.id} text={description} /> : null}

        {/* Repli Offi : seulement quand aucune source (lien dédié ni site du lieu). */}
        {work.sourceUrl && !officialUrl && !venueWebsite ? (
          <a href={work.sourceUrl} target="_blank" rel="noopener noreferrer" className="link inline-flex min-h-11 w-fit items-center text-sm">
            Voir sur Offi.fr
          </a>
        ) : null}
      </div>
    </article>
  )
}
