import { describe, expect, it } from 'vitest'
import { buildWorkUpsert } from '@/features/offi-import/mappers'
import { parseOffiJsonLine } from '@/features/offi-import/schemas'

describe('Offi ingestion helpers', () => {
  it('normalizes reversed dates and prices while keeping extra fields harmless', () => {
    const record = parseOffiJsonLine(
      JSON.stringify({
        url: 'https://www.offi.fr/theatre/theatre-antoine-1408/le-bourgeois-gentilhomme-101852.html',
        title: '  Le Bourgeois gentilhomme  ',
        category: 'Pièces de théâtre',
        venue: 'Théâtre Antoine',
        address: '14 boulevard de Strasbourg 75010 Paris',
        date_start: '2025-11-15',
        date_end: '2025-08-27',
        duration_min: 120,
        price_min_eur: 83,
        price_max_eur: 22,
        image: 'https://files.offi.fr/image.jpg',
        description: ' Une comédie baroque. ',
        crawled_at: '2026-03-11T10:00:00.000Z',
        ignored: true,
      }),
      1,
    )

    expect(record.title).toBe('Le Bourgeois gentilhomme')
    expect(record.date_start).toBe('2025-08-27')
    expect(record.date_end).toBe('2025-11-15')
    expect(record.price_min_eur).toBe(22)
    expect(record.price_max_eur).toBe(83)
  })

  it('builds non-destructive update payloads', () => {
    const record = parseOffiJsonLine(
      JSON.stringify({
        url: 'https://www.offi.fr/theatre/theatre-de-paris-3269/chers-parents-82668.html',
        title: 'Chers parents',
        category: null,
        venue: 'Théâtre de Paris',
        address: null,
        date_start: '2025-06-13',
        date_end: '2025-12-28',
        duration_min: null,
        price_min_eur: 33,
        price_max_eur: 48,
        image: 'https://files.offi.fr/parents.jpg',
        description: null,
        crawled_at: '2026-03-11T10:00:00.000Z',
      }),
      1,
    )

    const { create, update } = buildWorkUpsert(record)

    expect(create.category).toBeNull()
    expect(create.address).toBeNull()
    expect(update).not.toHaveProperty('category')
    expect(update).not.toHaveProperty('address')
    expect(update).toHaveProperty('venue', 'Théâtre de Paris')
  })

  it('rejects invalid records with useful line numbers', () => {
    expect(() =>
      parseOffiJsonLine(
        JSON.stringify({
          url: 'https://example.com/not-offi',
          title: '',
        }),
        42,
      ),
    ).toThrow(/Line 42/)
  })
})
