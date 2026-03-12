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
  sourceUrl: true,
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
  sourceUrl: string | null
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
    sourceUrl: work.sourceUrl,
  }
}
