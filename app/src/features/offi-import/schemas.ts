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
  // On TRONQUE à `max` plutôt que de rejeter : une fiche au champ trop long (ex.
  // category 121, director 161) ne doit pas être perdue. Les colonnes Postgres sont
  // en TEXT (sans limite) → la troncature ne concerne que cette borne applicative.
  return z.preprocess((value) => {
    const v = normalizeString(value)
    return typeof v === 'string' && v.length > max ? v.slice(0, max) : v
  }, z.string().max(max).nullable())
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

export const WORK_SOURCES = ['offi', 'direct'] as const
export type WorkSource = (typeof WORK_SOURCES)[number]
export const OFFI_URL_PREFIX = 'https://www.offi.fr/'

/** Slug de titre : même normalisation que `discover.slugify` côté scraper (NFKD, ASCII seul). */
export function titleSlug(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const nullableIso = z.preprocess(normalizeString, z.string().max(40).nullable())

const performanceSchema = z.object({
  start: nullableIso,
  end: nullableIso.optional(),
  availability: nullableString(40).optional(),
  price_min_eur: z.number().nonnegative().max(1000).nullish(),
  url: nullableHttpUrl(500).optional(),
})
export type Performance = z.infer<typeof performanceSchema>

// Séances : on garde les entrées valides et on écarte les autres (une séance aberrante
// ne doit pas faire perdre la fiche).
const performancesField = z.preprocess((value) => {
  if (!Array.isArray(value)) return []
  return value.filter((item) => performanceSchema.safeParse(item).success).slice(0, 200)
}, z.array(performanceSchema))

// Schéma unique pour les deux sources. `source` vaut `offi` (défaut, URL offi.fr exigée) ou
// `direct` (valeur brute `direct` ou `direct:<extracteur>` ; lieu obligatoire, URL http(s) libre :
// plusieurs spectacles d'un même lieu peuvent partager la page d'agenda).
export const offiWorkSchema = z
  .object({
    url: z.string().url().max(500),
    source: z.preprocess(normalizeString, z.string().max(60).nullable()).optional(),
    venue_slug: nullableString(160).optional(),
    booking_url: nullableHttpUrl(500).optional(),
    performances: performancesField.optional(),
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
    official_url: nullableHttpUrl(500),
    description: nullableString(20_000),
    director: nullableString(160),
    cast: z.preprocess(
      (value) => (Array.isArray(value) ? value : []),
      z.array(z.string().trim().min(1).max(160)).max(20),
    ),
    crawled_at: nullableDateTime,
  })
  .superRefine((record, ctx) => {
    const raw = record.source ?? 'offi'
    if (raw === 'offi') {
      if (!record.url.startsWith(OFFI_URL_PREFIX)) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: 'Expected an Offi URL' })
      }
      return
    }
    if (!raw.startsWith('direct')) {
      ctx.addIssue({ code: 'custom', path: ['source'], message: 'Expected source offi or direct' })
      return
    }
    if (!/^https?:\/\//.test(record.url)) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'Expected an HTTP URL' })
    }
    if (!record.venue_slug) {
      ctx.addIssue({ code: 'custom', path: ['venue_slug'], message: 'venue_slug required for a direct record' })
    }
    if (!titleSlug(record.title)) {
      ctx.addIssue({ code: 'custom', path: ['title'], message: 'Title has no usable slug' })
    }
  })
  .transform((record) => {
    const rawSource = record.source ?? 'offi'
    const source: WorkSource = rawSource === 'offi' ? 'offi' : 'direct'
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

    const venueSlug = record.venue_slug ?? null
    return {
      ...record,
      source,
      source_detail: source === 'direct' ? rawSource : null,
      venue_slug: venueSlug,
      booking_url: record.booking_url ?? null,
      performances: record.performances ?? [],
      // Identifiant d'une fiche directe : lieu + titre normalisé (pas l'URL, partagée par
      // plusieurs spectacles).
      direct_key: source === 'direct' && venueSlug ? `${venueSlug}:${titleSlug(record.title)}` : null,
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
