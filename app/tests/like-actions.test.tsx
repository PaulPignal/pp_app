import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import LikeActions from '@/features/reactions/ui/LikeActions'

describe('LikeActions', () => {
  beforeEach(() => {
    refreshMock.mockReset()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true, reaction: { id: 'reaction-1', status: 'SEEN' } }),
    } as Response)
  })

  it('posts SEEN and refreshes the page', async () => {
    const user = userEvent.setup()
    render(<LikeActions workId="work-1" />)

    await user.click(screen.getByRole('button', { name: /vu/i }))

    expect(fetch).toHaveBeenCalledWith(
      '/api/reactions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ workId: 'work-1', status: 'SEEN' }),
      }),
    )
    expect(refreshMock).toHaveBeenCalled()
  })
})
