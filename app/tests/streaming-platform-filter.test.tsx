import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const replaceMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: replaceMock, refresh: vi.fn(), push: vi.fn() }) }))

import StreamingPlatformFilter from '@/features/works/ui/StreamingPlatformFilter'

describe('StreamingPlatformFilter', () => {
  beforeEach(() => replaceMock.mockReset())

  it('« Toutes » est enfoncée quand aucune plateforme n’est choisie ; chaque puce expose son état', () => {
    render(<StreamingPlatformFilter available={['Netflix', 'Arte']} selected={[]} />)
    expect(screen.getByRole('group', { name: 'Filtrer par plateforme' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Netflix' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('un clic met à jour l’URL (filtre dans l’adresse) et l’état de la puce sans attendre', async () => {
    const user = userEvent.setup()
    render(<StreamingPlatformFilter available={['Netflix', 'Arte']} selected={['Arte']} />)

    await user.click(screen.getByRole('button', { name: 'Netflix' }))
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/discover?section=streaming&platforms=Arte%2CNetflix', { scroll: false }))

    await user.click(screen.getByRole('button', { name: 'Toutes' }))
    await waitFor(() => expect(replaceMock).toHaveBeenLastCalledWith('/discover?section=streaming', { scroll: false }))
  })

  it('ne rend rien sans plateforme disponible', () => {
    const { container } = render(<StreamingPlatformFilter available={[]} selected={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
