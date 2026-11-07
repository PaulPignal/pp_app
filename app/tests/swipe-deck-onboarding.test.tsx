import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }) }))
// Visiteur anonyme.
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }))

import SwipeDeck from '@/features/works/ui/SwipeDeck'

const items = [
  { id: 'w1', title: 'Œuvre 1', section: 'theatre', imageUrl: null, category: null, venue: null, address: null, description: null, startDate: null, endDate: null, durationMin: null, priceMin: null, priceMax: null, director: null, cast: [], sourceUrl: null },
  { id: 'w2', title: 'Œuvre 2', section: 'theatre', imageUrl: null, category: null, venue: null, address: null, description: null, startDate: null, endDate: null, durationMin: null, priceMin: null, priceMax: null, director: null, cast: [], sourceUrl: null },
]

describe('SwipeDeck : onboarding anonyme', () => {
  beforeEach(() => {
    localStorage.removeItem('offi:pendingLike')
    vi.mocked(fetch).mockReset()
  })

  it('la boîte de dialogue est nommée, reçoit le focus, se ferme par Échap et rend le focus au bouton Aimer', async () => {
    const user = userEvent.setup()
    render(<SwipeDeck items={items} />)

    const like = screen.getByRole('button', { name: 'Aimer' })
    await user.click(like)

    const dialog = await screen.findByRole('dialog', { name: 'Gardez ce coup de cœur' })
    expect(dialog).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Créer un compte' })).toHaveFocus())

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(like).toHaveFocus()
    // La carte n'a pas avancé : le visiteur peut encore décider.
    expect(screen.getByLabelText('Œuvre 1')).toBeInTheDocument()
  })

  it('« Plus tard » oublie le like mémorisé et passe à la carte suivante sans appel serveur', async () => {
    const user = userEvent.setup()
    render(<SwipeDeck items={items} />)

    await user.click(screen.getByRole('button', { name: 'Aimer' }))
    expect(localStorage.getItem('offi:pendingLike')).toBe('w1')

    await user.click(await screen.findByRole('button', { name: 'Plus tard' }))
    await screen.findByLabelText('Œuvre 2')
    expect(localStorage.getItem('offi:pendingLike')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('un « passer » anonyme avance sans rien enregistrer', async () => {
    const user = userEvent.setup()
    render(<SwipeDeck items={items} />)

    await user.click(screen.getByRole('button', { name: 'Passer' }))
    await screen.findByLabelText('Œuvre 2')
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
