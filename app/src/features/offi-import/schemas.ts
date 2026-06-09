import { z } from 'zod'
import { DEFAULT_WORK_SECTION, inferWorkSectionFromUrl, WORK_SECTION_VALUES } from '@/features/works/section'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizeString(value: unknown) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return value
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed === '' ? null : trimmed
}

function nullableString(max: number) {
  return z.preprocess(normalizeString, z.string().max(max).nullable())
}

function nullableHttpUrl(max: number) {
  return z.preprocess(
    normalizeString,
    z
      .string()
      .url()
      .max(max)
      .refine((value) => value.startsWith('http://') || value.startsWith('https://'), 'Expected an HTTP URL')
      .nullable(),
  )
}

const nullableIsoDate = z.preprocess(
  normalizeString,
  z
    .string()
    .regex(ISO_DATE_RE, 'Expected YYYY-MM-DD')
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Invalid calendar date')
    .nullable(),
)

const nullableDateTime = z.preprocess(
  normalizeString,
  z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid datetime')
    .nullable(),
)

const nullableInt = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? null : value),
  z.number().int().positive().max(600).nullable(),
)

const nullableYear = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? null : value),
  z.number().int().min(1880).max(2100).nullable(),
)

const nullableMoney = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return null
    // Prix aberrant (artefact de parsing, ex. 1170) → on ignore le prix plutôt
    // que d'invalider toute l'œuvre. Plafond relevé à 1000 pour les places premium.
    if (typeof value === 'number' && (value < 0 || value > 1000)) return null
    return value
  },
  z.number().nonnegative().max(1000).nullable(),
)

export const offiWorkSchema = z
  .object({
    url: z.string().url().max(500).refine((value) => value.startsWith('https://www.offi.fr/'), 'Expected an Offi URL'),
    title: z.preprocess(normalizeString, z.string().min(1).max(280)),
    section: z.preprocess(normalizeString, z.enum(WORK_SECTION_VALUES).nullish()),
    category: nullableString(120),
    venue: nullableString(160),
    address: nullableString(240),
    arrondissement: nullableString(80),
    country: nullableString(80),
    year: nullableYear,
    availability: nullableString(40),
    currency: nullableString(8),
    cinema_venue_count: z.preprocess(
      (value) => (value === undefined || value === null || value === '' ? null : value),
      z.number().int().min(0).max(5000).nullable(),
    ),
    cinema_venues: z.preprocess(
      (value) => (Array.isArray(value) ? value : []),
      z.array(z.string().trim().min(1).max(160)).max(20),
    ),
    date_start: nullableIsoDate,
    date_end: nullableIsoDate,
    duration_min: nullableInt,
    price_min_eur: nullableMoney,
    price_max_eur: nullableMoney,
    image: nullableHttpUrl(500),
    description: nullableString(20_000),
    director: nullableString(160),
    cast: z.preprocess(
      (value) => (Array.isArray(value) ? value : []),
      z.array(z.string().trim().min(1).max(160)).max(20),
    ),
    crawled_at: nullableDateTime,
  })
  .transform((record) => {
    const inferredSection = record.section ?? inferWorkSectionFromUrl(record.url) ?? DEFAULT_WORK_SECTION
    let dateStart = record.date_start
    let dateEnd = record.date_end
    let priceMin = record.price_min_eur
    let priceMax = record.price_max_eur

    if (dateStart && dateEnd && dateEnd < dateStart) {
      ;[dateStart, dateEnd] = [dateEnd, dateStart]
    }

    if (priceMin != null && priceMax != null && priceMin > priceMax) {
      ;[priceMin, priceMax] = [priceMax, priceMin]
    }

    return {
      ...record,
      section: inferredSection,
      date_start: dateStart,
      date_end: dateEnd,
      price_min_eur: priceMin,
      price_max_eur: priceMax,
    }
  })

export type OffiWorkRecord = z.infer<typeof offiWorkSchema>

export function parseOffiJsonLine(line: string, lineNumber: number): OffiWorkRecord {
  let raw: unknown

  try {
    raw = JSON.parse(line) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON'
    throw new Error(`Line ${lineNumber}: invalid JSON (${message})`)
  }

  const parsed = offiWorkSchema.safeParse(raw)
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ')
    throw new Error(`Line ${lineNumber}: invalid Offi record (${details})`)
  }

  return parsed.data
}
