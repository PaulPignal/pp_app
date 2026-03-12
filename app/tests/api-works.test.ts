import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSessionUserMock, listDiscoverWorksMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  listDiscoverWorksMock: vi.fn(),
}))

vi.mock('@/features/auth/server/session', () => ({
  getSessionUser: getSessionUserMock,
}))

vi.mock('@/features/works/server/queries', () => ({
  listDiscoverWorks: listDiscoverWorksMock,
}))

import { GET } from '@/app/api/works/route'

describe('/api/works', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when section is invalid', async () => {
    const response = await GET(new Request('http://localhost/api/works?section=opera'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toMatchObject({ ok: false, error: 'invalid_query' })
  })

  it('passes the section filter through to the feature query', async () => {
    getSessionUserMock.mockResolvedValue({ id: 'user-1', email: 'me@example.com' })
    listDiscoverWorksMock.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'work-1',
          title: 'Carmen de Kawachi',
          section: 'cinema',
          imageUrl: null,
          category: 'drame',
          venue: null,
          address: null,
          description: null,
          startDate: null,
          endDate: null,
          durationMin: 89,
          priceMin: null,
          priceMax: null,
          sourceUrl: 'https://www.offi.fr/cinema/evenement/carmen-de-kawachi-45189.html',
        },
      ],
    })

    const response = await GET(new Request('http://localhost/api/works?section=cinema&category=drame'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      ok: true,
      total: 1,
      items: [
        expect.objectContaining({
          id: 'work-1',
          section: 'cinema',
          category: 'drame',
        }),
      ],
    })
    expect(listDiscoverWorksMock).toHaveBeenCalledWith({
      per: 100,
      since: undefined,
      section: 'cinema',
      category: 'drame',
      userId: 'user-1',
    })
  })
})
