import { expect, test } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SwipeDeck from '@/features/works/ui/SwipeDeck'

test("avance à la carte suivante et appelle POST /api/reactions quand on clique Like", async () => {
  const items = [
    { id: 'w1', title: 'Œuvre 1', section: 'theatre', imageUrl: null, category: null, venue: null, address: null, description: null, startDate: null, endDate: null, durationMin: null, priceMin: null, priceMax: null, sourceUrl: null },
    { id: 'w2', title: 'Œuvre 2', section: 'theatre', imageUrl: null, category: null, venue: null, address: null, description: null, startDate: null, endDate: null, durationMin: null, priceMin: null, priceMax: null, sourceUrl: null },
  ]

  render(<SwipeDeck items={items} />)
  const user = userEvent.setup()

  const likeButton = screen.getByRole('button', { name: /aimer/i })
  expect(likeButton).toBeInTheDocument()

  await user.click(likeButton)

  await screen.findByLabelText('Œuvre 2')
  expect(screen.queryByLabelText('Œuvre 1')).not.toBeInTheDocument()

  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      '/api/reactions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ workId: 'w1', status: 'LIKE' }),
      }),
    ),
  )
})
