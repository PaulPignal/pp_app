import type { Prisma } from '@/generated/prisma/client'
import { cleanCategory } from '@/features/works/category'
import { OFFI_URL_PREFIX, titleSlug, type OffiWorkRecord } from '@/features/offi-import/schemas'
import { buildWorkUpsert } from '@/features/offi-import/mappers'

// Règle de fusion offi / direct (décision du 07/11/2026) :
//  - une fiche = un couple (lieu, titre normalisé) ; offi et direct pour ce couple = UNE ligne Work ;
//  - la source directe fait foi sur les dates, les séances, les prix, la disponibilité et le lien
//    de réservation ; offi garde ce que le direct n'a pas (description, image, catégorie…) ;
//  - `Work.sourceUrl` reste la clé d'unicité : l'URL offi pour une fiche offi, une URL
//    synthétique `<url>#direct=<lieu>:<slug>` pour une fiche directe seule (l'URL brute est
//    partagée par plusieurs spectacles).

export const DATA_SOURCE = { offi: 'offi', direct: 'direct', merged: 'offi+direct' } as const

/** Champs que la source directe écrase quand elle les renseigne. */
export const DIRECT_PRIORITY_FIELDS = [
  'startDate',
  'endDate',
  'priceMin',
  'priceMax',
  'availability',
  'currency',
  'performances',
  'bookingUrl',
] as const

/** Lecture minimale d'une ligne Work existante, nécessaire à la fusion. */
export type ExistingWork = {
  id: string
  title: string
  sourceUrl: string
  directKey: string | null
  dataSource: string | null
  category: string | null
  description: string | null
  imageUrl: string | null
  durationMin: number | null
  director: string | null
  cast: string[]
  address: string | null
  arrondissement: string | null
  officialUrl: string | null
  venue: string | null
}

export function hasDirect(existing: Pick<ExistingWork, 'dataSource'> | null | undefined) {
  return existing?.dataSource === DATA_SOURCE.direct || existing?.dataSource === DATA_SOURCE.merged
}

function toDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null
}

export function directSourceUrl(record: Pick<OffiWorkRecord, 'url' | 'direct_key'>): string {
  const base = record.url.split('#')[0]
  return `${base}#direct=${encodeURIComponent(record.direct_key ?? '')}`
}

/** Identifiant de lieu offi lu dans l'URL d'une fiche : `/theatre/<lieu>-<id>/<fiche>.html`. */
export function offiVenueIdFromUrl(url: string): number | null {
  if (!url.startsWith(OFFI_URL_PREFIX)) return null
  const match = /^https:\/\/www\.offi\.fr\/[^/]+\/[^/]*?-(\d+)\/[^/]+\.html/.exec(url)
  return match ? Number(match[1]) : null
}

/** Cherche la ligne existante qui correspond à un enregistrement direct : clé directe d'abord,
 *  puis fiche offi du même lieu au titre normalisé identique (jamais déjà fusionnée). */
export function findForDirect(record: OffiWorkRecord, byDirectKey: Map<string, ExistingWork>, venueWorks: ExistingWork[]) {
  if (record.direct_key) {
    const hit = byDirectKey.get(record.direct_key)
    if (hit) return hit
  }
  const slug = titleSlug(record.title)
  return venueWorks.find((work) => !work.directKey && work.dataSource !== DATA_SOURCE.direct && titleSlug(work.title) === slug) ?? null
}

type DirectWrite =
  | { kind: 'create'; create: Prisma.WorkCreateInput }
  | { kind: 'update'; id: string; update: Prisma.WorkUpdateInput }

function performancesJson(record: OffiWorkRecord): Prisma.InputJsonValue | undefined {
  return record.performances.length > 0 ? (record.performances as unknown as Prisma.InputJsonValue) : undefined
}

export function buildDirectWrite(record: OffiWorkRecord, existing: ExistingWork | null, venueId: string | null): DirectWrite {
  const performances = performancesJson(record)

  if (!existing) {
    const create: Prisma.WorkCreateInput = {
      title: record.title,
      section: record.section,
      category: cleanCategory(record.category),
      venue: record.venue ?? null,
      address: record.address ?? null,
      description: record.description ?? null,
      startDate: toDate(record.date_start),
      endDate: toDate(record.date_end),
      durationMin: record.duration_min ?? null,
      priceMin: record.price_min_eur ?? null,
      priceMax: record.price_max_eur ?? null,
      imageUrl: record.image ?? null,
      director: record.director ?? null,
      cast: record.cast ?? [],
      arrondissement: record.arrondissement ?? null,
      country: record.country ?? null,
      year: record.year ?? null,
      availability: record.availability ?? null,
      currency: record.currency ?? null,
      officialUrl: record.official_url ?? null,
      bookingUrl: record.booking_url ?? null,
      sourceUrl: directSourceUrl(record),
      directKey: record.direct_key,
      dataSource: DATA_SOURCE.direct,
      ...(performances ? { performances } : {}),
      ...(venueId ? { venue_ref: { connect: { id: venueId } } } : {}),
    }
    return { kind: 'create', create }
  }

  const update: Prisma.WorkUpdateInput = { directKey: record.direct_key }
  const directOnly = existing.dataSource === DATA_SOURCE.direct

  // Priorité à la source directe.
  if (record.date_start != null) update.startDate = toDate(record.date_start)
  if (record.date_end != null) update.endDate = toDate(record.date_end)
  if (record.price_min_eur != null) update.priceMin = record.price_min_eur
  if (record.price_max_eur != null) update.priceMax = record.price_max_eur
  if (record.availability != null) update.availability = record.availability
  if (record.currency != null) update.currency = record.currency
  if (performances) update.performances = performances
  if (record.booking_url != null) update.bookingUrl = record.booking_url

  // Identité et contenu : le direct seul les écrase ; une fiche offi garde les siens et le
  // direct ne comble que les vides.
  const prefer = <T>(current: T | null, incoming: T | null | undefined) =>
    directOnly ? (incoming ?? undefined) : current == null || current === '' ? (incoming ?? undefined) : undefined
  const assign = <K extends keyof Prisma.WorkUpdateInput>(key: K, value: Prisma.WorkUpdateInput[K] | null | undefined) => {
    if (value !== undefined && value !== null) update[key] = value
  }
  if (directOnly) update.title = record.title
  assign('category', prefer(existing.category, cleanCategory(record.category)))
  assign('description', prefer(existing.description, record.description))
  assign('imageUrl', prefer(existing.imageUrl, record.image))
  assign('durationMin', prefer(existing.durationMin, record.duration_min))
  assign('director', prefer(existing.director, record.director))
  assign('address', prefer(existing.address, record.address))
  assign('arrondissement', prefer(existing.arrondissement, record.arrondissement))
  assign('officialUrl', prefer(existing.officialUrl, record.official_url))
  assign('venue', prefer(existing.venue, record.venue))
  if (record.cast.length > 0 && (directOnly || existing.cast.length === 0)) update.cast = record.cast

  update.dataSource = directOnly ? DATA_SOURCE.direct : DATA_SOURCE.merged
  return { kind: 'update', id: existing.id, update }
}

/** Écriture d'une fiche offi : si la ligne porte déjà des données directes, l'offi ne touche
 *  plus aux champs prioritaires du direct. */
export function buildOffiWrite(record: OffiWorkRecord, existing: Pick<ExistingWork, 'dataSource'> | null) {
  const { create, update } = buildWorkUpsert(record)
  if (hasDirect(existing)) {
    for (const field of DIRECT_PRIORITY_FIELDS) delete (update as Record<string, unknown>)[field]
  }
  return { create, update }
}

/** Adoption : une fiche offi qui arrive après une fiche directe seule du même lieu et du même
 *  titre prend la place de l'URL synthétique (la ligne devient fusionnée, aucun doublon). */
export function buildOffiAdoption(record: OffiWorkRecord) {
  const { update } = buildWorkUpsert(record)
  for (const field of DIRECT_PRIORITY_FIELDS) delete (update as Record<string, unknown>)[field]
  // Le direct seul avait déjà un titre ; offi fait foi sur l'identité une fois fusionné.
  return { ...update, sourceUrl: record.url, dataSource: DATA_SOURCE.merged } satisfies Prisma.WorkUpdateInput
}

/** Identifiant offi d'un lieu depuis son slug de catalogue (`grande-salle-6005` donne 6005). */
export function offiIdFromVenueSlug(slug: string): number | null {
  const match = /-(\d+)$/.exec(slug)
  return match ? Number(match[1]) : null
}

/** Lit `data/venues/direct_only.csv` : une colonne `venue_slug` (la première), lignes vides et
 *  commentaires (`#`) ignorés. Un lieu listé n'est plus ingéré depuis offi. Fichier modifié à la
 *  main par Paul, jamais par un script. */
export function parseDirectOnly(text: string): Set<number> {
  const ids = new Set<number>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const slug = line.split(',')[0].trim().replace(/^"|"$/g, '')
    if (slug === 'venue_slug') continue
    const id = offiIdFromVenueSlug(slug)
    if (id != null) ids.add(id)
  }
  return ids
}
