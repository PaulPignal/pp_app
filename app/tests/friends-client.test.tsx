import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

import FriendsClient from '@/features/friendships/ui/FriendsClient'

describe('FriendsClient', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true, friend: { id: 'friend-2', email: 'new@example.com' } }),
    } as Response)
  })

  it('adds a friend by email and updates the list', async () => {
    const user = userEvent.setup()
    render(<FriendsClient initialFriends={[]} inviteToken="token-1" />)

    await user.type(screen.getByPlaceholderText('email@exemple.com'), 'new@example.com')
    await user.click(screen.getAllByRole('button', { name: 'Ajouter' })[0])

    expect(fetch).toHaveBeenCalledWith(
      '/api/friends',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'new@example.com' }),
      }),
    )
    expect(await screen.findByText('new@example.com')).toBeInTheDocument()
  }, 15000)

  it('loads common works inline for a selected friend', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          ok: true,
          works: [
            {
              id: 'work-1',
              title: 'Hamlet',
              section: 'theatre',
              imageUrl: null,
              category: null,
              venue: 'Comédie-Française',
              address: null,
              description: null,
              startDate: '2026-03-01T00:00:00.000Z',
              endDate: '2026-03-30T00:00:00.000Z',
              durationMin: 120,
              priceMin: 18,
              priceMax: 42,
              sourceUrl: 'https://www.offi.fr/hamlet',
            },
          ],
        }),
    } as Response)

    const user = userEvent.setup()
    render(<FriendsClient initialFriends={[{ id: 'friend-1', email: 'friend@example.com' }]} inviteToken="token-1" />)

    await user.click(screen.getByRole('button', { name: /œuvres en commun/i }))

    expect(fetch).toHaveBeenCalledWith('/api/common?friendId=friend-1', undefined)
    expect(await screen.findByText('Hamlet')).toBeInTheDocument()
    expect(screen.getByText('Comédie-Française')).toBeInTheDocument()
  }, 15000)
})
