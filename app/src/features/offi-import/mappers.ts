import type { Prisma } from '@/generated/prisma/client'
import type { OffiWorkRecord } from '@/features/offi-import/schemas'

function toDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

export function buildWorkUpsert(record: OffiWorkRecord): {
  create: Prisma.WorkCreateInput
  update: Prisma.WorkUpdateInput
} {
  const create: Prisma.WorkCreateInput = {
    title: record.title,
    category: record.category ?? null,
    venue: record.venue ?? null,
    address: record.address ?? null,
    description: record.description ?? null,
    startDate: toDate(record.date_start),
    endDate: toDate(record.date_end),
    durationMin: record.duration_min ?? null,
    priceMin: record.price_min_eur ?? null,
    priceMax: record.price_max_eur ?? null,
    imageUrl: record.image ?? null,
    sourceUrl: record.url,
  }

  const update: Prisma.WorkUpdateInput = {
    title: record.title,
  }

  if (record.category != null) update.category = record.category
  if (record.venue != null) update.venue = record.venue
  if (record.address != null) update.address = record.address
  if (record.description != null) update.description = record.description
  if (record.date_start != null) update.startDate = toDate(record.date_start)
  if (record.date_end != null) update.endDate = toDate(record.date_end)
  if (record.duration_min != null) update.durationMin = record.duration_min
  if (record.price_min_eur != null) update.priceMin = record.price_min_eur
  if (record.price_max_eur != null) update.priceMax = record.price_max_eur
  if (record.image != null) update.imageUrl = record.image

  return { create, update }
}
