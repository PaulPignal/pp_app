import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <div aria-label={alt} data-testid="mock-image" />,
}))

import LikeDetailModal from '@/features/reactions/ui/LikeDetailModal'
import type { WorkCardDto } from '@/features/works/dto'

const base: WorkCardDto = {
  id: 'w1',
  title: 'Les Misérables',
  section: 'theatre',
  imageUrl: null,
  category: 'Comédie musicale',
  venue: 'Théâtre du Châtelet',
  address: '1 place du Châtelet',
  description: 'Une reprise attendue.',
  venueDescription: null,
  startDate: '2026-10-18T00:00:00.000Z',
  endDate: '2026-11-10T00:00:00.000Z',
  durationMin: 95,
  priceMin: 18,
  priceMax: 54,
  director: 'Julie Deliquet',
  cast: ['Isabelle Carré'],
  arrondissement: 'Paris 1er',
  country: null,
  year: null,
  availability: 'InStock',
  currency: 'EUR',
  cinemaVenueCount: null,
  cinemaVenues: [],
  platforms: [],
  rating: null,
  ratingCount: null,
  officialUrl: null,
  externalUrl: null,
  sourceUrl: 'https://www.offi.fr/theatre/x.html',
  venueInfo: { name: 'Théâtre du Châtelet', metro: 'Châtelet', access: 'Accès PMR', phone: '01 40 28 28 40', city: 'Paris 1er', website: 'https://www.chatelet.com' },
}

function renderModal(work: WorkCardDto, onClose = vi.fn()) {
  const utils = render(
    <>
      <button type="button">Ouvreur</button>
      <LikeDetailModal work={work} fallbackTitle="x" friends={[{ id: 'f1', name: 'Lea' }]} bucket="like" onClose={onClose} onSeen={vi.fn()} onRemove={vi.fn()} />
    </>,
  )
  return { ...utils, onClose }
}

describe('LikeDetailModal', () => {
  it('fiche : dates, lieu, tarif, durée, accès et amis sont listés, le titre nomme la boîte', () => {
    renderModal(base)
    const dialog = screen.getByRole('dialog', { name: 'Les Misérables' })
    const terms = within(dialog).getAllByRole('term').map((t) => t.textContent)
    expect(terms).toEqual(['Dates', 'Lieu', 'Tarif', 'Durée', 'Métro', 'Accès', 'Téléphone'])
    expect(within(dialog).getByText(/18 oct\. 2026/)).toBeInTheDocument()
    expect(within(dialog).getByText('18 € - 54 €')).toBeInTheDocument()
    expect(within(dialog).getByText('1 h 35')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Théâtre du Châtelet · Paris 1er/ })).toHaveAttribute('href', 'https://www.chatelet.com')
    expect(within(dialog).getByText('Lea')).toBeInTheDocument()
  })

  it('billetterie : « Réserver des billets » quand des places sont disponibles', () => {
    renderModal(base)
    const cta = screen.getByRole('link', { name: /Réserver des billets/ })
    expect(cta).toHaveAttribute('href', base.sourceUrl)
    expect(screen.getByRole('link', { name: /Itinéraire/ })).toHaveAttribute('href', expect.stringContaining('google.com/maps'))
  })

  it('billetterie : « Complet » quand la séance est épuisée, « Où regarder » pour le streaming', () => {
    const { unmount } = renderModal({ ...base, availability: 'SoldOut' })
    expect(screen.getByRole('link', { name: /Complet, voir sur Offi\.fr/ })).toBeInTheDocument()
    unmount()

    renderModal({ ...base, section: 'streaming', platforms: ['Netflix'], officialUrl: 'https://tmdb.org/watch', venue: null, address: null })
    expect(screen.getByRole('link', { name: /Où regarder/ })).toHaveAttribute('href', 'https://tmdb.org/watch')
    expect(screen.queryByRole('link', { name: /Itinéraire/ })).not.toBeInTheDocument()
    expect(screen.getByText('Netflix')).toBeInTheDocument()
  })

  it('clavier : le focus arrive sur Fermer, Échap ferme, le focus revient à l’élément déclencheur', async () => {
    const user = userEvent.setup()
    const opener = document.createElement('button')
    opener.textContent = 'Déclencheur'
    document.body.appendChild(opener)
    opener.focus()

    const { onClose, unmount } = renderModal(base)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus())
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    expect(opener).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
    opener.remove()
  })

  it('clavier : la tabulation reste dans la boîte de dialogue', async () => {
    const user = userEvent.setup()
    renderModal(base)
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus())

    await user.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
    // Dernier élément focalisable : l'action principale (billetterie), dans le pied fixe de la boîte.
    expect(screen.getByRole('link', { name: /Réserver des billets/ })).toHaveFocus()
  })
})
