import type { ReactNode } from 'react'
import type { WorkCardDto } from '@/features/works/dto'
import { workDirectorLabel, workSectionLabel } from '@/features/works/section'
import WorkImage from '@/features/works/ui/WorkImage'
import SourceLink from '@/features/works/ui/SourceLink'
import { IconImage, IconTv } from '@/shared/ui/icons'
import { formatDateRange, formatDuration, formatPriceRange, formatRating } from '@/features/works/ui/work-formatters'

type WorkSummaryCardProps = {
  work: WorkCardDto | null
  fallbackTitle: string
  /** Identifiant du titre (pour aria-labelledby d'une boîte de dialogue). */
  titleId?: string
  children?: ReactNode
}

// Fiche complète d'une œuvre : affiche, titre, crédits, description entière et
// liste de faits (dates, lieu, tarif, durée, accès). Les actions viennent en `children`.
export default function WorkSummaryCard({ work, fallbackTitle, titleId, children }: WorkSummaryCardProps) {
  const title = work?.title ?? fallbackTitle
  const dateLabel = work ? formatDateRange(work.startDate, work.endDate) : null
  const priceLabel = work ? formatPriceRange(work.priceMin, work.priceMax) : null
  const durationLabel = work ? formatDuration(work.durationMin) : null
  const ratingLabel = formatRating(work?.rating, work?.ratingCount)
  const description = (work?.venueDescription ?? work?.description)?.trim()
  const director = work?.director?.trim()
  const castNames = work?.cast?.slice(0, 5) ?? []
  const directorLabel = workDirectorLabel(work?.section)
  const isCinema = work?.section === 'cinema'
  const venueLine = work ? [work.venue, !isCinema ? work.arrondissement : null].filter(Boolean).join(' · ') : ''
  const cinemaMeta = isCinema ? [work.country, work.year].filter(Boolean).join(' · ') : ''
  // Titre → page événement du lieu, sinon lien rel=external d'Offi.
  const officialUrl = work?.officialUrl ?? work?.externalUrl ?? null
  const venueWebsite = work?.venueInfo?.website ?? null
  const cinemaVenuesLine =
    isCinema && work.cinemaVenueCount
      ? `${work.cinemaVenueCount} salle${work.cinemaVenueCount > 1 ? 's' : ''}${
          work.cinemaVenues.length ? ' · ' + work.cinemaVenues.slice(0, 3).join(', ') : ''
        }`
      : ''
  const address = [work?.address, isCinema ? null : work?.arrondissement].filter(Boolean).join(', ')
  const venueMetro = work?.venueInfo?.metro?.trim()
  const venueAccess = work?.venueInfo?.access?.trim()
  const venuePhone = work?.venueInfo?.phone?.trim()

  const facts: Array<[string, ReactNode]> = []
  if (dateLabel) facts.push(['Dates', dateLabel])
  if (venueLine || address) {
    facts.push([
      'Lieu',
      <>
        {venueLine ? <SourceLink label={venueLine} href={venueWebsite} copy={false} /> : null}
        {address ? <span className="block text-ink-muted">{address}</span> : null}
      </>,
    ])
  }
  if (cinemaVenuesLine) facts.push(['Salles', cinemaVenuesLine])
  if (priceLabel) facts.push(['Tarif', priceLabel])
  if (durationLabel) facts.push(['Durée', durationLabel])
  if (venueMetro) facts.push(['Métro', venueMetro])
  if (venueAccess) facts.push(['Accès', venueAccess])
  if (venuePhone) facts.push(['Téléphone', <a key="tel" href={`tel:${venuePhone.replace(/\s/g, '')}`} className="link">{venuePhone}</a>])
  if (ratingLabel) facts.push(['Note', `${ratingLabel} / 10`])

  return (
    <article className="flex flex-col gap-4">
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-fill">
        <WorkImage
          src={work?.imageUrl}
          alt=""
          sizes="(max-width: 640px) 100vw, 576px"
          className="object-cover"
          fallback={
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-ink-muted">
              <IconImage size={28} />
              Pas d’image
            </div>
          }
        />
      </div>

      <div className="flex flex-col gap-1">
        {work?.section ? <p className="eyebrow">{workSectionLabel(work.section)}</p> : null}
        <h2 id={titleId} className="display text-2xl text-ink">
          {officialUrl ? <SourceLink label={title} href={officialUrl} /> : title}
        </h2>
        {cinemaMeta ? <p className="text-sm text-ink-muted">{cinemaMeta}</p> : null}
        {director || castNames.length > 0 ? (
          <div className="mt-1 text-sm leading-6">
            {director ? (
              <p>
                <span className="text-ink-muted">{directorLabel} </span>
                <span className="font-semibold text-ink">{director}</span>
              </p>
            ) : null}
            {castNames.length > 0 ? (
              <p>
                <span className="text-ink-muted">Avec </span>
                <span className="text-ink">{castNames.join(', ')}</span>
              </p>
            ) : null}
          </div>
        ) : null}
        {work?.platforms && work.platforms.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
      </div>

      {description ? <p className="text-sm leading-6 text-ink-muted">{description}</p> : null}

      {facts.length > 0 ? (
        <dl className="facts border-t border-line pt-4">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* Repli Offi : uniquement si aucune source (lien dédié ni site du lieu). */}
      {work?.sourceUrl && !officialUrl && !venueWebsite ? (
        <a href={work.sourceUrl} target="_blank" rel="noreferrer" className="link inline-flex min-h-11 w-fit items-center text-sm">
          Voir sur Offi.fr
        </a>
      ) : null}

      {children}
    </article>
  )
}
