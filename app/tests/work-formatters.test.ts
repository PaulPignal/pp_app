import { describe, expect, it } from 'vitest'
import { formatAvailability, formatEndsIn } from '@/features/works/ui/work-formatters'

const now = new Date('2026-06-09T10:00:00.000Z')

describe('formatEndsIn', () => {
  it('aujourd’hui = dernier jour (urgent)', () => {
    expect(formatEndsIn('2026-06-09T20:00:00.000Z', now)).toMatchObject({ label: 'Dernier jour', urgent: true })
  })

  it('demain (urgent)', () => {
    expect(formatEndsIn('2026-06-10T00:00:00.000Z', now)).toMatchObject({ label: 'Se termine demain', urgent: true })
  })

  it('dans 5 jours = urgent', () => {
    expect(formatEndsIn('2026-06-14T00:00:00.000Z', now)).toMatchObject({ label: 'Plus que 5 jours', urgent: true })
  })

  it('dans 15 jours = non urgent', () => {
    expect(formatEndsIn('2026-06-24T00:00:00.000Z', now)).toMatchObject({ urgent: false })
  })

  it('échéance lointaine ou passée ou absente = null', () => {
    expect(formatEndsIn('2026-09-01T00:00:00.000Z', now)).toBeNull()
    expect(formatEndsIn('2026-06-01T00:00:00.000Z', now)).toBeNull()
    expect(formatEndsIn(null, now)).toBeNull()
  })
})

describe('formatAvailability', () => {
  it('InStock → succès', () => {
    expect(formatAvailability('InStock')).toMatchObject({ label: 'Billets dispo', tone: 'success' })
  })
  it('SoldOut → danger', () => {
    expect(formatAvailability('SoldOut')).toMatchObject({ label: 'Complet', tone: 'danger' })
  })
  it('inconnu → null', () => {
    expect(formatAvailability('Bogus')).toBeNull()
    expect(formatAvailability(null)).toBeNull()
  })
})
