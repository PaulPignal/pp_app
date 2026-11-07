import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({ usePathname: () => '/likes' }))
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { email: 'paul@example.com' } }, status: 'authenticated' }),
  signOut: vi.fn(),
}))

import { BottomNav, Sidebar, Wordmark } from '@/features/auth/ui/AppNav'

describe('Navigation', () => {
  it('barre latérale : la page courante porte aria-current, le compte et la déconnexion sont accessibles', () => {
    render(<Sidebar />)
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' })
    expect(within(nav).getByRole('link', { name: 'Mes likes' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Découverte' })).not.toHaveAttribute('aria-current')
    expect(screen.getByText('paul@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Passer en thème/ })).toBeInTheDocument()
  })

  it('barre du bas : trois destinations nommées, la page courante marquée', () => {
    render(<BottomNav />)
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Découverte', 'Mes likes', 'Amis'])
    expect(screen.getByRole('link', { name: 'Mes likes' })).toHaveAttribute('aria-current', 'page')
  })

  it('la marque est un lien nommé en toutes lettres', () => {
    render(<Wordmark tagline />)
    expect(screen.getByRole('link', { name: 'Offi, retour à la découverte' })).toHaveAttribute('href', '/discover')
  })
})
