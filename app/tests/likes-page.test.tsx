import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { requireSessionUserMock, listLibraryWorksMock, friendsWhoLikedMock, redirectMock } = vi.hoisted(() => ({
  requireSessionUserMock: vi.fn(),
  listLibraryWorksMock: vi.fn(),
  friendsWhoLikedMock: vi.fn(),
  redirectMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <div aria-label={alt} data-testid="mock-image" />,
}))

vi.mock('@/features/auth/server/session', () => ({
  requireSessionUserOrRedirect: requireSessionUserMock,
}))

vi.mock('@/features/reactions/server/queries', () => ({
  listLibraryWorks: listLibraryWorksMock,
  friendsWhoLiked: friendsWhoLikedMock,
}))

import LikesPage from '@/app/likes/page'

function work(id: string, title: string, endDate: string | null) {
  return {
    id,
    title,
    section: 'theatre',
    imageUrl: null,
    category: null,
    venue: null,
    address: null,
    description: null,
    startDate: null,
    endDate,
    durationMin: null,
    priceMin: null,
    priceMax: null,
    director: null,
    cast: [],
    arrondissement: null,
    country: null,
    year: null,
    availability: null,
    currency: null,
    sourceUrl: 'https://www.offi.fr/x',
    venueInfo: null,
  }
}

describe('/likes page', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-12T10:00:00.000Z'))
    requireSessionUserMock.mockResolvedValue({ id: 'user-1', email: 'me@example.com' })
    friendsWhoLikedMock.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('affiche les likes courants et archivés dans l’onglet « Tous »', async () => {
    listLibraryWorksMock.mockResolvedValue({
      likes: [
        { workId: 'work-current', work: work('work-current', 'Hamlet', '2026-03-30T00:00:00.000Z') },
        { workId: 'work-archived', work: work('work-archived', 'La Lecon', '2026-03-11T00:00:00.000Z') },
      ],
      seen: [],
    })

    render(await LikesPage())

    expect(screen.getByRole('button', { name: /Voir le détail de Hamlet/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Voir le détail de La Lecon/ })).toBeInTheDocument()
    expect(friendsWhoLikedMock).toHaveBeenCalledWith('user-1', ['work-current', 'work-archived'])
  })

  it('n’affiche que les œuvres à l’affiche en vue active', async () => {
    listLibraryWorksMock.mockResolvedValue({
      likes: [
        { workId: 'work-current', work: work('work-current', 'Hamlet', '2026-03-30T00:00:00.000Z') },
        { workId: 'work-archived', work: work('work-archived', 'La Lecon', '2026-03-11T00:00:00.000Z') },
      ],
      seen: [],
    })

    render(await LikesPage({ searchParams: Promise.resolve({ view: 'active' }) }))

    expect(screen.getByRole('button', { name: /Voir le détail de Hamlet/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Voir le détail de La Lecon/ })).not.toBeInTheDocument()
  })
})
