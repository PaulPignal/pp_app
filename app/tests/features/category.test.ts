import { describe, expect, it } from 'vitest'
import { cleanCategory, splitGenres } from '@/features/works/category'

describe('splitGenres', () => {
  it('dédoublonne et préserve les genres composés', () => {
    expect(splitGenres('drame - drame / road-movie')).toEqual(['drame', 'road-movie'])
  })

  it('découpe sur " · " et ignore les segments vides', () => {
    expect(splitGenres('comédie · comédie /  ')).toEqual(['comédie'])
  })

  it('dédoublonne sans tenir compte de la casse en gardant la 1re graphie', () => {
    expect(splitGenres('Drame / drame')).toEqual(['Drame'])
  })

  it('renvoie [] pour null/vide', () => {
    expect(splitGenres(null)).toEqual([])
    expect(splitGenres('   ')).toEqual([])
  })
})

describe('cleanCategory', () => {
  it('rejoint les genres nettoyés par " / "', () => {
    expect(cleanCategory('drame - drame / road-movie')).toBe('drame / road-movie')
  })

  it('renvoie null quand il ne reste rien', () => {
    expect(cleanCategory(null)).toBeNull()
    expect(cleanCategory('   ')).toBeNull()
  })
})
