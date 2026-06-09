import { expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Visiteur anonyme.
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }))

import SwipeDeck from '@/features/works/ui/SwipeDeck'

const items = [
  { id: 'w1', title: 'Œuvre 1', section: 'theatre', imageUrl: null, category: null, venue: null, address: null, description: null, startDate: null, endDate: null, durationMin: null, priceMin: null, priceMax: null, director: null, cast: [], sourceUrl: null },
  { id: 'w2', title: 'Œuvre 2', section: 'theatre', imageUrl: null, category: null, venue: null, address: null, description: null, startDate: null, endDate: null, durationMin: null, priceMin: null, priceMax: null, director: null, cast: [], sourceUrl: null },
]

test("anonyme : le 1er like ouvre la modale d'inscription, sans POST, et mémorise le like", async () => {
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
  vi.stubGlobal('fetch', fetchMock)
  try {
    localStorage.removeItem('offi:pendingLike')
  } catch {
    /* ignore */
  }

  render(<SwipeDeck items={items} />)
  await userEvent.click(screen.getByRole('button', { name: 'Aimer' }))

  // La modale d'inscription apparaît
  expect(await screen.findByText('Créer un compte')).toBeInTheDocument()
  // …aucune réaction n'est envoyée au serveur…
  expect(fetchMock).not.toHaveBeenCalled()
  // …et le like est mémorisé pour être rejoué après création de compte.
  expect(localStorage.getItem('offi:pendingLike')).toBe('w1')
})
