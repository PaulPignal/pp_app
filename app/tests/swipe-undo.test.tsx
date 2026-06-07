import { expect, test } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SwipeDeck from '@/features/works/ui/SwipeDeck'

const items = [
  { id: 'w1', title: 'Œuvre 1', section: 'theatre', imageUrl: null, category: null, venue: null, address: null, description: null, startDate: null, endDate: null, durationMin: null, priceMin: null, priceMax: null, director: null, cast: [], sourceUrl: null },
  { id: 'w2', title: 'Œuvre 2', section: 'theatre', imageUrl: null, category: null, venue: null, address: null, description: null, startDate: null, endDate: null, durationMin: null, priceMin: null, priceMax: null, director: null, cast: [], sourceUrl: null },
]

test('annule le dernier swipe : revient à la carte précédente et DELETE /api/reactions', async () => {
  render(<SwipeDeck items={items} />)
  const user = userEvent.setup()

  // Au départ, rien à annuler.
  expect(screen.getByRole('button', { name: /annuler le dernier swipe/i })).toBeDisabled()

  // Swipe "Aimer" → on avance à Œuvre 2 (POST LIKE).
  await user.click(screen.getByRole('button', { name: /aimer/i }))
  await screen.findByLabelText('Œuvre 2')

  // Une fois le swipe confirmé côté serveur, "Annuler" s'active.
  await waitFor(() => expect(screen.getByRole('button', { name: /annuler le dernier swipe/i })).not.toBeDisabled())

  // Annuler → retour à Œuvre 1 + DELETE de la réaction de w1.
  await user.click(screen.getByRole('button', { name: /annuler le dernier swipe/i }))
  await screen.findByLabelText('Œuvre 1')
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      '/api/reactions?workId=w1',
      expect.objectContaining({ method: 'DELETE' }),
    ),
  )

  // Historique vidé → "Annuler" redevient désactivé.
  await waitFor(() => expect(screen.getByRole('button', { name: /annuler le dernier swipe/i })).toBeDisabled())
})
