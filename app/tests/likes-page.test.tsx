import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

const { requireSessionUserMock, listLikedWorksMock, redirectMock } = vi.hoisted(() => ({
  requireSessionUserMock: vi.fn(),
  listLikedWorksMock: vi.fn(),
  redirectMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}))

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <div aria-label={alt} data-testid="mock-image" />,
}))

vi.mock('@/features/auth/server/session', () => ({
  requireSessionUser: requireSessionUserMock,
}))

vi.mock('@/features/reactions/server/queries', () => ({
  listLikedWorks: listLikedWorksMock,
}))

vi.mock('@/features/reactions/ui/LikeActions', () => ({
  default: ({ workId }: { workId: string }) => <div>Actions {workId}</div>,
}))

import LikesPage from '@/app/likes/page'

describe('/likes page', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-12T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('splits current likes from works that are no longer showing', async () => {
    requireSessionUserMock.mockResolvedValue({ id: 'user-1', email: 'me@example.com' })
    listLikedWorksMock.mockResolvedValue([
      {
        workId: 'work-current',
        work: {
          id: 'work-current',
          title: 'Hamlet',
          section: 'theatre',
          imageUrl: null,
          category: null,
          venue: null,
          address: null,
          description: null,
          startDate: '2026-03-01T00:00:00.000Z',
          endDate: '2026-03-30T00:00:00.000Z',
          durationMin: null,
          priceMin: null,
          priceMax: null,
          sourceUrl: 'https://www.offi.fr/hamlet',
        },
      },
      {
        workId: 'work-archived',
        work: {
          id: 'work-archived',
          title: 'La Lecon',
          section: 'theatre',
          imageUrl: null,
          category: null,
          venue: null,
          address: null,
          description: null,
          startDate: '2026-02-01T00:00:00.000Z',
          endDate: '2026-03-11T00:00:00.000Z',
          durationMin: null,
          priceMin: null,
          priceMax: null,
          sourceUrl: 'https://www.offi.fr/la-lecon',
        },
      },
    ])

    render(await LikesPage())

    const currentSection = screen.getByRole('heading', { name: 'À l’affiche' }).closest('section')
    const archivedSection = screen.getByRole('heading', { name: 'Plus à l’affiche' }).closest('section')

    expect(currentSection).not.toBeNull()
    expect(archivedSection).not.toBeNull()
    expect(within(currentSection as HTMLElement).getByText('Hamlet')).toBeInTheDocument()
    expect(within(archivedSection as HTMLElement).getByText('La Lecon')).toBeInTheDocument()
    expect(within(currentSection as HTMLElement).queryByText('La Lecon')).not.toBeInTheDocument()
  })
})
