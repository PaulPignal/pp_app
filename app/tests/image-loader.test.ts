import { describe, expect, it } from 'vitest'
import offiImageLoader from '../image-loader'

const OFFI = 'https://files.offi.fr/evenement/105426/images/1000/abc.jpg'

describe('offiImageLoader', () => {
  it('mappe vers la taille offi 120 pour une vignette', () => {
    expect(offiImageLoader({ src: OFFI, width: 80 })).toBe(
      'https://files.offi.fr/evenement/105426/images/120/abc.jpg',
    )
  })

  it('mappe vers 200 pour une largeur intermédiaire', () => {
    expect(offiImageLoader({ src: OFFI, width: 160 })).toContain('/images/200/')
  })

  it('mappe vers 1000 pour une grande largeur', () => {
    expect(offiImageLoader({ src: OFFI, width: 480 })).toContain('/images/1000/')
  })

  it('réécrit aussi une source déjà en 120 vers la bonne taille', () => {
    const small = 'https://files.offi.fr/lieu/3113/images/120/x.jpg'
    expect(offiImageLoader({ src: small, width: 480 })).toContain('/images/1000/')
  })

  it('laisse les URLs non-offi inchangées', () => {
    expect(offiImageLoader({ src: 'https://example.com/x.png', width: 200 })).toBe('https://example.com/x.png')
  })
})
