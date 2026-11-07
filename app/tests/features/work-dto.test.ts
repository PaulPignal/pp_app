import { describe, expect, it } from 'vitest'
import { mapWorkToCardDto } from '@/features/works/dto'

type Record = Parameters<typeof mapWorkToCardDto>[0]

const base = {
  id: 'w1',
  title: 'Hamlet',
  section: 'theatre',
  description: 'Texte offi',
  venueDescription: null,
  startDate: null,
  endDate: new Date('2026-12-01T00:00:00.000Z'),
  cinemaVenues: [],
  officialUrl: null,
  externalUrl: null,
  sourceUrl: 'https://www.offi.fr/theatre/x.html',
  venue_ref: null,
} as unknown as Record

describe('mapWorkToCardDto', () => {
  it('une seule description : celle du lieu d’abord, sinon offi', () => {
    expect(mapWorkToCardDto(base).description).toBe('Texte offi')
    const dto = mapWorkToCardDto({ ...base, venueDescription: '  Texte du lieu ' })
    expect(dto.description).toBe('Texte du lieu')
    expect(dto).not.toHaveProperty('venueDescription')
  })

  it('un seul lien dédié, http(s) seulement', () => {
    expect(mapWorkToCardDto({ ...base, externalUrl: 'https://salle.fr/billets' }).officialUrl).toBe('https://salle.fr/billets')
    expect(mapWorkToCardDto({ ...base, officialUrl: 'javascript:alert(1)', externalUrl: 'https://salle.fr' }).officialUrl).toBe('https://salle.fr')
    const dto = mapWorkToCardDto({
      ...base,
      venue_ref: { name: 'Salle', metro: null, access: null, phone: null, city: null, website: 'data:text/html,x' },
    })
    expect(dto.venueInfo?.website).toBeNull()
    expect(dto).not.toHaveProperty('externalUrl')
  })

  it('trois salles de cinéma au plus, dates en ISO', () => {
    const dto = mapWorkToCardDto({ ...base, cinemaVenues: ['a', 'b', 'c', 'd', 'e'] })
    expect(dto.cinemaVenues).toEqual(['a', 'b', 'c'])
    expect(dto.endDate).toBe('2026-12-01T00:00:00.000Z')
  })
})
