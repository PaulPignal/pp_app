import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import SegmentedControl from '@/shared/ui/SegmentedControl'

const NAV_ITEMS = [
  { label: 'Théâtre', value: 'theatre', href: '/discover?section=theatre' },
  { label: 'Cinéma', value: 'cinema', href: '/discover?section=cinema' },
]

const RADIO_ITEMS = [
  { label: 'Par email', value: 'email' },
  { label: 'Par lien', value: 'link' },
  { label: 'Désactivé', value: 'off', disabled: true },
]

describe('SegmentedControl', () => {
  it('navigation : une barre de liens, la section courante porte aria-current', () => {
    render(<SegmentedControl ariaLabel="Sections" value="cinema" items={NAV_ITEMS} />)
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cinéma' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Théâtre' })).not.toHaveAttribute('aria-current')
  })

  it('choix unique : un groupe radio, seule la valeur active est tabulable', () => {
    render(<SegmentedControl ariaLabel="Mode" value="email" items={RADIO_ITEMS} onChange={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Par email' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Par email' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Par lien' })).toHaveAttribute('tabindex', '-1')
  })

  it('flèches du clavier : passe à l’option suivante (en sautant les options désactivées) et boucle', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SegmentedControl ariaLabel="Mode" value="link" items={RADIO_ITEMS} onChange={onChange} />)

    screen.getByRole('radio', { name: 'Par lien' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('email')
    await user.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('email')
    await user.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith('link')
  })

  it('affiche un compteur quand il est fourni', () => {
    render(<SegmentedControl ariaLabel="État" value="a" items={[{ label: 'Archivées', value: 'a', href: '/x', count: 3 }]} />)
    expect(screen.getByRole('link', { name: 'Archivées 3' })).toBeInTheDocument()
  })
})
