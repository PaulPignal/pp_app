import { describe, expect, it } from 'vitest'
import { safeCallbackUrl } from '@/features/auth/callback-url'

describe('safeCallbackUrl', () => {
  it.each([
    ['/likes', '/likes'],
    ['/friends?token=abc.def', '/friends?token=abc.def'],
    ['/discover#top', '/discover#top'],
  ])('garde le chemin interne %s', (input, expected) => {
    expect(safeCallbackUrl(input)).toBe(expected)
  })

  it.each([
    null,
    undefined,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'javascript:alert(1)',
    'likes',
    '/%5C%5Cevil.example',
  ])('renvoie / pour %j', (input) => {
    const result = safeCallbackUrl(input)
    expect(result.startsWith('/')).toBe(true)
    expect(result.startsWith('//')).toBe(false)
    expect(new URL(result, 'https://app.example').origin).toBe('https://app.example')
  })

  it('refuse explicitement les formes de redirection ouverte', () => {
    for (const input of ['https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example']) {
      expect(safeCallbackUrl(input)).toBe('/')
    }
  })
})
