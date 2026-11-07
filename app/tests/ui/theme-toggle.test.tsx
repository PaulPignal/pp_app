import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ThemeToggle from '@/shared/ui/ThemeToggle'

describe('ThemeToggle', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme
    localStorage.removeItem('theme')
    vi.restoreAllMocks()
  })

  it('bascule data-theme sur <html> et mémorise le choix', async () => {
    const user = userEvent.setup()
    document.documentElement.dataset.theme = 'dark'
    render(<ThemeToggle />)

    const button = screen.getByRole('button', { name: 'Changer de thème' })
    await user.click(button)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')

    await user.click(button)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('reste fonctionnel si le stockage local est indisponible', async () => {
    const user = userEvent.setup()
    document.documentElement.dataset.theme = 'dark'
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'Changer de thème' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('variante ligne : le libellé annonce le thème vers lequel on bascule', () => {
    render(<ThemeToggle variant="row" />)
    const button = screen.getByRole('button')
    expect(button).toHaveTextContent('Passer en thème clair')
    expect(button).toHaveTextContent('Passer en thème sombre')
  })
})
