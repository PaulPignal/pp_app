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
  })
})
