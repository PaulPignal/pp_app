import { describe, expect, it } from 'vitest'
import {
  WORK_SECTION_VALUES,
  inferWorkSectionFromUrl,
  workDirectorLabel,
  workSectionLabel,
} from '@/features/works/section'

describe('sections', () => {
  it('inclut les 7 sections (dont streaming)', () => {
    expect(WORK_SECTION_VALUES).toEqual(['theatre', 'cinema', 'streaming', 'exposition', 'concert', 'visite', 'enfants'])
  })

  it('streaming : libellé et crédit', () => {
    expect(workSectionLabel('streaming')).toBe('Streaming')
    expect(workDirectorLabel('streaming')).toBe('De')
  })

  it('infère la section depuis l’URL offi', () => {
    expect(inferWorkSectionFromUrl('https://www.offi.fr/expositions-musees/grand-palais-5399/x-1.html')).toBe('exposition')
    expect(inferWorkSectionFromUrl('https://www.offi.fr/concerts/cafe-1598/x-2.html')).toBe('concert')
    expect(inferWorkSectionFromUrl('https://www.offi.fr/visites-conferences/g-1/x-3.html')).toBe('visite')
    expect(inferWorkSectionFromUrl('https://www.offi.fr/enfants/t-1/x-4.html')).toBe('enfants')
    expect(inferWorkSectionFromUrl('https://www.offi.fr/theatre/t-1/x-5.html')).toBe('theatre')
    expect(inferWorkSectionFromUrl('https://www.offi.fr/cinema/evenement/x-6.html')).toBe('cinema')
    expect(inferWorkSectionFromUrl('https://example.com/x')).toBeNull()
  })

  it('libellés et crédits par section', () => {
    expect(workSectionLabel('exposition')).toBe('Exposition')
    expect(workSectionLabel('enfants')).toBe('Jeune public')
    expect(workSectionLabel('inconnu')).toBe('Sortie')
    expect(workDirectorLabel('concert')).toBe('Avec')
    expect(workDirectorLabel('cinema')).toBe('De')
    expect(workDirectorLabel('theatre')).toBe('Mise en scène')
  })
})
