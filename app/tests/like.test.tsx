// tests/like.test.tsx
import { test, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SwipeDeck from '../src/components/SwipeDeck' // <- chemin relatif (pas d'alias)

test("avance à la carte suivante et appelle POST /api/likes quand on clique Like", async () => {
  // pas besoin d'importer le type Work ici
  const items = [
    { id: 'w1', title: 'Œuvre 1' },
    { id: 'w2', title: 'Œuvre 2' },
  ]

  render(<SwipeDeck items={items} />)

  const user = userEvent.setup()

  // Le bouton Like est présent
  const likeBtn = screen.getByRole('button', { name: /like/i })
  expect(likeBtn).toBeInTheDocument()

  // Clique "Like" — userEvent encapsule déjà act()
  await user.click(likeBtn)

  // 1) Attendre que la carte suivante soit rendue
  await screen.findByLabelText('Œuvre 2')

  // 2) Puis s'assurer que l’ancienne n’est plus trouvable
  expect(screen.queryByLabelText('Œuvre 1')).not.toBeInTheDocument()

  // 3) Vérifier l’appel réseau (fetch doit être stubé dans tests/setup.tsx)
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      '/api/likes',
      expect.objectContaining({ method: 'POST' }),
    ),
  )
})
