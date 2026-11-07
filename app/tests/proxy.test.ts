// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getTokenMock } = vi.hoisted(() => ({ getTokenMock: vi.fn() }))
vi.mock('next-auth/jwt', () => ({ getToken: getTokenMock }))

import proxy, { config } from '@/proxy'

describe('proxy', () => {
  it('laisse la Découverte publique, protège Mes likes et Amis', () => {
    expect(config.matcher).toEqual(['/likes/:path*', '/friends/:path*'])
  })

  it('sans session : redirige vers la connexion en gardant chemin et requête', async () => {
    getTokenMock.mockResolvedValue(null)
    const res = await proxy(new NextRequest('http://localhost/friends?token=abc.def'))
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/signin')
    expect(location.searchParams.get('callbackUrl')).toBe('/friends?token=abc.def')
    expect([...location.searchParams.keys()]).toEqual(['callbackUrl'])
  })

  it('avec session : laisse passer', async () => {
    getTokenMock.mockResolvedValue({ uid: 'u1' })
    const res = await proxy(new NextRequest('http://localhost/likes'))
    expect(res.headers.get('location')).toBeNull()
  })
})
