import type { Prisma } from '@/generated/prisma/client'
import type { WorkSection } from '@/features/works/section'

export const workCardSelect = {
  id: true,
  title: true,
  section: true,
  imageUrl: true,
  category: true,
  venue: true,
  address: true,
  description: true,
  venueDescription: true,
  startDate: true,
  endDate: true,
  durationMin: true,
  priceMin: true,
  priceMax: true,
  director: true,
  cast: true,
  arrondissement: true,
  country: true,
  year: true,
  availability: true,
  currency: true,
  cinemaVenueCount: true,
  cinemaVenues: true,
  platforms: true,
  rating: true,
  ratingCount: true,
  officialUrl: true,
  externalUrl: true,
  sourceUrl: true,
  venue_ref: {
    select: { name: true, metro: true, access: true, phone: true, city: true, website: true },
  },
} satisfies Prisma.WorkSelect

type WorkCardRecord = Prisma.WorkGetPayload<{ select: typeof workCardSelect }>

// Lien affiché tel quel dans un href : http(s) seulement (jamais javascript: ni data:),
// contrôlé ici, au seul point de sortie, quelle que soit la source (ingestion, backfill).
function httpUrlOrNull(value: string | null): string | null {
  return value && /^https?:\/\//i.test(value) ? value : null
}

type VenueInfo = NonNullable<WorkCardRecord['venue_ref']>

export type WorkCardDto = Omit<
  WorkCardRecord,
  'section' | 'startDate' | 'endDate' | 'venueDescription' | 'externalUrl' | 'venue_ref'
> & {
  section: WorkSection
  startDate: string | null
  endDate: string | null
  venueInfo: VenueInfo | null
}

// Une seule description (celle du site du lieu, sinon celle d'offi), un seul lien dédié
// (officialUrl, sinon externalUrl) et 3 salles au plus : le client n'affiche rien d'autre.
export function mapWorkToCardDto(work: WorkCardRecord): WorkCardDto {
  const { venueDescription, externalUrl, venue_ref, ...rest } = work
  return {
    ...rest,
    section: work.section as WorkSection,
    description: (venueDescription ?? work.description)?.trim() || null,
    startDate: work.startDate?.toISOString() ?? null,
    endDate: work.endDate?.toISOString() ?? null,
    cinemaVenues: work.cinemaVenues.slice(0, 3),
    officialUrl: httpUrlOrNull(work.officialUrl) ?? httpUrlOrNull(externalUrl),
    venueInfo: venue_ref ? { ...venue_ref, website: httpUrlOrNull(venue_ref.website) } : null,
  }
}
