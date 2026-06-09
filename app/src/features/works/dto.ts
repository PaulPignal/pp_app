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
  officialUrl: true,
  sourceUrl: true,
  venue_ref: {
    select: { name: true, metro: true, access: true, phone: true, city: true, website: true },
  },
} satisfies Prisma.WorkSelect

type WorkCardRecord = Prisma.WorkGetPayload<{ select: typeof workCardSelect }>

export type WorkCardDto = {
  id: string
  title: string
  section: WorkSection
  imageUrl: string | null
  category: string | null
  venue: string | null
  address: string | null
  description: string | null
  startDate: string | null
  endDate: string | null
  durationMin: number | null
  priceMin: number | null
  priceMax: number | null
  director: string | null
  cast: string[]
  arrondissement: string | null
  country: string | null
  year: number | null
  availability: string | null
  currency: string | null
  cinemaVenueCount: number | null
  cinemaVenues: string[]
  platforms: string[]
  officialUrl: string | null
  sourceUrl: string | null
  venueInfo: {
    name: string
    metro: string | null
    access: string | null
    phone: string | null
    city: string | null
    website: string | null
  } | null
}

export function mapWorkToCardDto(work: WorkCardRecord): WorkCardDto {
  return {
    id: work.id,
    title: work.title,
    section: work.section as WorkSection,
    imageUrl: work.imageUrl,
    category: work.category,
    venue: work.venue,
    address: work.address,
    description: work.description,
    startDate: work.startDate?.toISOString() ?? null,
    endDate: work.endDate?.toISOString() ?? null,
    durationMin: work.durationMin,
    priceMin: work.priceMin,
    priceMax: work.priceMax,
    director: work.director,
    cast: work.cast,
    arrondissement: work.arrondissement,
    country: work.country,
    year: work.year,
    availability: work.availability,
    currency: work.currency,
    cinemaVenueCount: work.cinemaVenueCount,
    cinemaVenues: work.cinemaVenues,
    platforms: work.platforms,
    officialUrl: work.officialUrl,
    sourceUrl: work.sourceUrl,
    venueInfo: work.venue_ref
      ? {
          name: work.venue_ref.name,
          metro: work.venue_ref.metro,
          access: work.venue_ref.access,
          phone: work.venue_ref.phone,
          city: work.venue_ref.city,
          website: work.venue_ref.website,
        }
      : null,
  }
}
