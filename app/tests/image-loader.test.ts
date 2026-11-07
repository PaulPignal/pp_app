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

  it('sert les affiches TMDB à la taille demandée, plafonnée à w500', () => {
    const poster = 'https://image.tmdb.org/t/p/w500/abc.jpg'
    expect(offiImageLoader({ src: poster, width: 64 })).toBe('https://image.tmdb.org/t/p/w92/abc.jpg')
    expect(offiImageLoader({ src: poster, width: 160 })).toBe('https://image.tmdb.org/t/p/w185/abc.jpg')
    expect(offiImageLoader({ src: poster, width: 256 })).toBe('https://image.tmdb.org/t/p/w342/abc.jpg')
    expect(offiImageLoader({ src: poster, width: 384 })).toBe('https://image.tmdb.org/t/p/w500/abc.jpg')
    expect(offiImageLoader({ src: poster, width: 1080 })).toBe('https://image.tmdb.org/t/p/w500/abc.jpg')
    expect(offiImageLoader({ src: 'https://image.tmdb.org/t/p/original/abc.jpg', width: 160 })).toBe(
      'https://image.tmdb.org/t/p/w185/abc.jpg',
    )
  })

  it('laisse les URLs non-offi inchangées', () => {
    expect(offiImageLoader({ src: 'https://example.com/x.png', width: 200 })).toBe('https://example.com/x.png')
  })
})
