import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('@/server/db', () => ({ prisma: {} }))

import { parseOffiJsonLine, titleSlug } from '@/features/offi-import/schemas'
import {
  buildDirectWrite,
  buildOffiAdoption,
  buildOffiWrite,
  directSourceUrl,
  findForDirect,
  offiVenueIdFromUrl,
  parseDirectOnly,
  type ExistingWork,
} from '@/features/offi-import/merge'
import { readOffiFile } from '@/features/offi-import/server/ingest'

const direct = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    url: 'https://www.monfort.example/agenda',
    title: 'Le Bourgeois Gentilhomme',
    section: 'theatre',
    source: 'direct:mapado',
    venue_slug: 'theatre-a-1',
    date_start: '2026-11-20',
    date_end: '2026-12-20',
    price_min_eur: 12,
    availability: 'InStock',
    booking_url: 'https://billetterie.example/resa/1',
    description: 'Texte direct',
    performances: [{ start: '2026-11-20T20:00:00+01:00', availability: 'InStock', price_min_eur: 12, url: 'https://billetterie.example/s/1' }],
    ...extra,
  })

const offi = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    url: 'https://www.offi.fr/theatre/theatre-a-1/le-bourgeois-gentilhomme-101852.html',
    title: 'Le bourgeois gentilhomme',
    section: 'theatre',
    date_start: '2025-01-10',
    date_end: '2027-01-10',
    price_min_eur: 20,
    description: 'Texte offi',
    image: 'https://files.offi.fr/a.jpg',
    category: 'Comédie',
    ...extra,
  })

const existingOffi = (extra: Partial<ExistingWork> = {}): ExistingWork => ({
  id: 'w1',
  title: 'Le bourgeois gentilhomme',
  sourceUrl: 'https://www.offi.fr/theatre/theatre-a-1/le-bourgeois-gentilhomme-101852.html',
  directKey: null,
  dataSource: null,
  category: 'Comédie',
  description: 'Texte offi',
  imageUrl: 'https://files.offi.fr/a.jpg',
  durationMin: null,
  director: null,
  cast: [],
  address: null,
  arrondissement: null,
  officialUrl: null,
  venue: 'Théâtre A',
  ...extra,
})

describe('schéma unifié : validation selon la source', () => {
  it('accepte un enregistrement direct (URL libre, lieu obligatoire) et calcule la clé lieu + slug', () => {
    const record = parseOffiJsonLine(direct(), 1)
    expect(record.source).toBe('direct')
    expect(record.source_detail).toBe('direct:mapado')
    expect(record.direct_key).toBe('theatre-a-1:le-bourgeois-gentilhomme')
    expect(record.performances).toHaveLength(1)
    expect(record.booking_url).toBe('https://billetterie.example/resa/1')
  })

  it('accepte un enregistrement offi sans champ source (compatibilité), sans clé directe', () => {
    const record = parseOffiJsonLine(offi(), 1)
    expect(record.source).toBe('offi')
    expect(record.direct_key).toBeNull()
    expect(record.performances).toEqual([])
  })

  it('rejette une URL hors offi.fr pour la source offi, y compris source explicite', () => {
    expect(() => parseOffiJsonLine(offi({ url: 'https://evil.example/x.html' }), 2)).toThrow(/Line 2/)
    expect(() => parseOffiJsonLine(offi({ url: 'https://evil.example/x.html', source: 'offi' }), 3)).toThrow(/Offi URL/)
  })

  it('rejette un direct sans venue_slug, avec une URL non http, ou une source inconnue', () => {
    expect(() => parseOffiJsonLine(direct({ venue_slug: null }), 4)).toThrow(/venue_slug/)
    expect(() => parseOffiJsonLine(direct({ url: 'ftp://x.example/a' }), 5)).toThrow(/Line 5/)
    expect(() => parseOffiJsonLine(direct({ source: 'scraper-pirate' }), 6)).toThrow(/source/)
    expect(() => parseOffiJsonLine(direct({ title: '«»' }), 7)).toThrow(/slug/)
  })

  it('écarte une séance invalide sans perdre la fiche', () => {
    const record = parseOffiJsonLine(direct({ performances: [{ start: 12 }, { start: '2026-11-20', url: 'pas une url' }, { start: '2026-11-21' }] }), 8)
    expect(record.performances).toEqual([expect.objectContaining({ start: '2026-11-21' })])
  })

  it('slug de titre identique au scraper : accents retirés, caractères non ASCII supprimés', () => {
    expect(titleSlug('Le Bourgeois Gentilhomme !')).toBe('le-bourgeois-gentilhomme')
    expect(titleSlug('Éloge de l’été')).toBe('eloge-de-lete')
  })
})

describe('fusion offi / direct', () => {
  it('direct seul : crée une fiche dataSource direct, clé directe, URL synthétique unique', () => {
    const record = parseOffiJsonLine(direct(), 1)
    const write = buildDirectWrite(record, findForDirect(record, new Map(), []), 'venue-1')
    expect(write.kind).toBe('create')
    if (write.kind !== 'create') return
    expect(write.create.dataSource).toBe('direct')
    expect(write.create.directKey).toBe('theatre-a-1:le-bourgeois-gentilhomme')
    expect(write.create.sourceUrl).toBe(directSourceUrl(record))
    expect(write.create.sourceUrl).toContain('#direct=theatre-a-1%3Ale-bourgeois-gentilhomme')
    expect(write.create.bookingUrl).toBe('https://billetterie.example/resa/1')
    expect(write.create.performances).toHaveLength(1)
    expect(write.create.venue_ref).toEqual({ connect: { id: 'venue-1' } })
  })

  it('offi seul : fiche inchangée côté clé (sourceUrl offi), champs directs vides', () => {
    const { create, update } = buildOffiWrite(parseOffiJsonLine(offi(), 1), null)
    expect(create.sourceUrl).toContain('offi.fr')
    expect(create.dataSource).toBe('offi')
    expect(create).not.toHaveProperty('directKey')
    expect(create).not.toHaveProperty('bookingUrl')
    expect(update).toHaveProperty('startDate')
  })

  it('les deux : une seule fiche, direct prioritaire sur dates, prix, disponibilité, réservation, séances ; offi garde description, image, catégorie', () => {
    const record = parseOffiJsonLine(direct({ image: 'https://direct.example/i.jpg', category: 'Autre' }), 1)
    const existing = existingOffi()
    const found = findForDirect(record, new Map(), [existing])
    expect(found?.id).toBe('w1') // titre normalisé identique malgré la casse
    const write = buildDirectWrite(record, found, 'venue-1')
    expect(write.kind).toBe('update')
    if (write.kind !== 'update') return
    const u = write.update
    expect(u.startDate).toEqual(new Date('2026-11-20T00:00:00.000Z'))
    expect(u.endDate).toEqual(new Date('2026-12-20T00:00:00.000Z'))
    expect(u.priceMin).toBe(12)
    expect(u.availability).toBe('InStock')
    expect(u.bookingUrl).toBe('https://billetterie.example/resa/1')
    expect(u.performances).toBeDefined()
    expect(u).not.toHaveProperty('description')
    expect(u).not.toHaveProperty('imageUrl')
    expect(u).not.toHaveProperty('category')
    expect(u).not.toHaveProperty('title')
    expect(u.directKey).toBe('theatre-a-1:le-bourgeois-gentilhomme')
    expect(u.dataSource).toBe('offi+direct')
  })

  it('les deux : le direct comble les vides de la fiche offi', () => {
    const record = parseOffiJsonLine(direct({ image: 'https://direct.example/i.jpg', duration_min: 90 }), 1)
    const write = buildDirectWrite(record, existingOffi({ imageUrl: null, description: null }), null)
    if (write.kind !== 'update') throw new Error('update attendu')
    expect(write.update.imageUrl).toBe('https://direct.example/i.jpg')
    expect(write.update.description).toBe('Texte direct')
    expect(write.update.durationMin).toBe(90)
  })

  it('homonymes de lieux différents : deux clés distinctes, aucune fusion entre lieux', () => {
    const a = parseOffiJsonLine(direct({ venue_slug: 'theatre-a-1' }), 1)
    const b = parseOffiJsonLine(direct({ venue_slug: 'theatre-b-2' }), 2)
    expect(a.direct_key).not.toBe(b.direct_key)
    // la fiche offi du lieu A n'est jamais proposée pour le lieu B (seules les fiches du lieu sont passées)
    expect(findForDirect(b, new Map(), [])).toBeNull()
    const keyed = new Map([[a.direct_key as string, existingOffi({ id: 'a', directKey: a.direct_key, dataSource: 'direct' })]])
    expect(findForDirect(b, keyed, [])).toBeNull()
    expect(findForDirect(a, keyed, [])?.id).toBe('a')
  })

  it('URL partagée : deux spectacles d’un lieu avec la même URL gardent deux fiches distinctes', () => {
    const one = parseOffiJsonLine(direct({ title: 'Pièce Un' }), 1)
    const two = parseOffiJsonLine(direct({ title: 'Pièce Deux' }), 2)
    expect(one.url).toBe(two.url)
    expect(directSourceUrl(one)).not.toBe(directSourceUrl(two))
  })

  it('URL partagée en lecture de fichier : pas de dédoublonnage par URL pour le direct, mais par clé', async () => {
    const file = path.join(os.tmpdir(), `merge-${process.pid}.jsonl`)
    fs.writeFileSync(file, [direct({ title: 'Pièce Un' }), direct({ title: 'Pièce Deux' }), direct({ title: 'Pièce un' })].join('\n'))
    try {
      const records = await readOffiFile(file)
      expect(records.map((r) => r.title)).toEqual(['Pièce Un', 'Pièce Deux'])
    } finally {
      fs.rmSync(file, { force: true })
    }
  })

  it('une fiche directe seule déjà fusionnée est mise à jour (clé directe), titre direct écrasé', () => {
    const record = parseOffiJsonLine(direct({ title: 'Le Bourgeois Gentilhomme (reprise)' }), 1)
    const keyed = new Map([[record.direct_key as string, existingOffi({ id: 'd', dataSource: 'direct', directKey: record.direct_key })]])
    const write = buildDirectWrite(record, findForDirect(record, keyed, []), null)
    if (write.kind !== 'update') throw new Error('update attendu')
    expect(write.update.title).toBe('Le Bourgeois Gentilhomme (reprise)')
    expect(write.update.dataSource).toBe('direct')
  })

  it('offi sur une ligne qui porte du direct : ne touche plus aux champs prioritaires', () => {
    const { update } = buildOffiWrite(parseOffiJsonLine(offi(), 1), existingOffi({ dataSource: 'offi+direct' }))
    for (const field of ['startDate', 'endDate', 'priceMin', 'priceMax', 'availability', 'currency']) {
      expect(update).not.toHaveProperty(field)
    }
    expect(update).toHaveProperty('description', 'Texte offi')
  })

  it('offi arrivant après un direct seul : adoption, la ligne prend l’URL offi sans toucher aux dates directes', () => {
    const update = buildOffiAdoption(parseOffiJsonLine(offi(), 1))
    expect(update.sourceUrl).toContain('offi.fr')
    expect(update.dataSource).toBe('offi+direct')
    expect(update).not.toHaveProperty('startDate')
    expect(update).toHaveProperty('description', 'Texte offi')
  })
})

describe('lieux et direct_only.csv', () => {
  it('lit l’identifiant de lieu dans une URL offi, null hors lieu', () => {
    expect(offiVenueIdFromUrl('https://www.offi.fr/theatre/theatre-de-la-huchette-2490/crime-et-chatiment-105182.html')).toBe(2490)
    expect(offiVenueIdFromUrl('https://www.offi.fr/cinema/evenement/carmen-de-kawachi-45189.html')).toBeNull()
    expect(offiVenueIdFromUrl('https://evil.example/theatre/x-1/y.html')).toBeNull()
  })

  it('direct_only.csv : en-tête, commentaires et lignes vides ignorés', () => {
    const ids = parseDirectOnly('venue_slug,date_decision\n# commentaire\n\ntheatre-de-la-huchette-2490,2026-12-01\n"bo-saint-martin-77"\n')
    expect([...ids].sort((a, b) => a - b)).toEqual([77, 2490])
    expect(parseDirectOnly('venue_slug\n').size).toBe(0)
  })
})
