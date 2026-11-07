import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import StatusBanner from '@/shared/ui/StatusBanner'
import EmptyState from '@/shared/ui/EmptyState'

describe('StatusBanner', () => {
  it('une erreur est annoncée immédiatement (alert), un succès poliment (status)', () => {
    const { rerender } = render(<StatusBanner tone="error">Oups</StatusBanner>)
    expect(screen.getByRole('alert')).toHaveTextContent('Oups')
    rerender(<StatusBanner tone="success">Bravo</StatusBanner>)
    expect(screen.getByRole('status')).toHaveTextContent('Bravo')
  })

  it('propose un bouton de fermeture quand onDismiss est fourni', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(
      <StatusBanner tone="info" onDismiss={onDismiss}>
        Info
      </StatusBanner>,
    )
    await user.click(screen.getByRole('button', { name: 'Fermer le message' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('EmptyState', () => {
  it('rend un titre au niveau demandé, une explication et une action', () => {
    render(
      <EmptyState headingLevel="h1" title="Rien ici" action={<button type="button">Agir</button>}>
        Explication courte.
      </EmptyState>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Rien ici' })).toBeInTheDocument()
    expect(screen.getByText('Explication courte.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agir' })).toBeInTheDocument()
  })
})
