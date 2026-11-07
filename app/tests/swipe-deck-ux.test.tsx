import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, replace: vi.fn(), push: vi.fn() }) }))
// Utilisateur connecté : les swipes persistent.

import SwipeDeck from '@/features/works/ui/SwipeDeck'
import type { WorkCardDto } from '@/features/works/dto'

function work(id: string, title: string): WorkCardDto {
  return {
    id,
    title,
    section: 'theatre',
    imageUrl: null,
    category: null,
    venue: null,
    address: null,
    description: null,
    venueDescription: null,
    startDate: null,
    endDate: null,
    durationMin: null,
    priceMin: null,
    priceMax: null,
    director: null,
    cast: [],
    arrondissement: null,
    country: null,
    year: null,
    availability: null,
    currency: null,
    cinemaVenueCount: null,
    cinemaVenues: [],
    platforms: [],
    rating: null,
    ratingCount: null,
    officialUrl: null,
    externalUrl: null,
    sourceUrl: null,
    venueInfo: null,
  }
}

const items = [work('w1', 'Œuvre 1'), work('w2', 'Œuvre 2')]

function okResponse() {
  return { ok: true, json: async () => ({}), text: async () => '{}' } as Response
}

describe('SwipeDeck : interactions', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockResolvedValue(okResponse())
    refreshMock.mockReset()
  })

  it('clavier : flèche droite aime, flèche gauche passe', async () => {
    const user = userEvent.setup()
    render(<SwipeDeck authed items={[...items, work('w3', 'Œuvre 3')]} />)

    await user.keyboard('{ArrowRight}')
    await screen.findByLabelText('Œuvre 2')
    expect(fetch).toHaveBeenLastCalledWith('/api/reactions', expect.objectContaining({ body: JSON.stringify({ workId: 'w1', status: 'LIKE' }) }))

    await user.keyboard('{ArrowLeft}')
    await screen.findByLabelText('Œuvre 3')
    expect(fetch).toHaveBeenLastCalledWith('/api/reactions', expect.objectContaining({ body: JSON.stringify({ workId: 'w2', status: 'DISLIKE' }) }))
  })

  it('clavier : les flèches tapées dans un champ de saisie ne déclenchent pas de swipe', async () => {
    const user = userEvent.setup()
    render(
      <>
        <input aria-label="Recherche" />
        <SwipeDeck authed items={items} />
      </>,
    )
    await user.click(screen.getByLabelText('Recherche'))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByLabelText('Œuvre 1')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('glisser puis relâcher sous le seuil : la carte reste, rien n’est envoyé', async () => {
    // Geste lent (1 s) et court (30 px) : ni la distance ni la vitesse ne valident le swipe.
    let clock = 0
    const now = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 1000))
    render(<SwipeDeck authed items={items} />)
    const card = screen.getByLabelText('Œuvre 1')

    fireEvent.pointerDown(card, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(card, { clientX: 130, pointerId: 1 })
    fireEvent.pointerUp(card, { clientX: 130, pointerId: 1 })

    await waitFor(() => expect(screen.getByLabelText('Œuvre 1')).toBeInTheDocument())
    expect(fetch).not.toHaveBeenCalled()
    now.mockRestore()
  })

  it('glisser loin vers la droite : aime et passe à la carte suivante', async () => {
    render(<SwipeDeck authed items={items} />)
    const card = screen.getByLabelText('Œuvre 1')

    fireEvent.pointerDown(card, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(card, { clientX: 320, pointerId: 1 })
    fireEvent.pointerUp(card, { clientX: 320, pointerId: 1 })

    await screen.findByLabelText('Œuvre 2')
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/reactions', expect.objectContaining({ body: JSON.stringify({ workId: 'w1', status: 'LIKE' }) })),
    )
  })

  it('échec serveur : la carte revient et une alerte explique quoi faire', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, text: async () => JSON.stringify({ error: 'server_error' }) } as Response)
    const user = userEvent.setup()
    render(<SwipeDeck authed items={items} />)

    await user.click(screen.getByRole('button', { name: 'Aimer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('n’a pas été enregistré')
    expect(screen.getByLabelText('Œuvre 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /annuler le dernier swipe/i })).toBeDisabled()
  })

  it('fin de pile : un état vide propose de recharger', async () => {
    const user = userEvent.setup()
    render(<SwipeDeck authed items={[work('w1', 'Seule')]} />)

    await user.click(screen.getByRole('button', { name: 'Passer' }))

    expect(await screen.findByRole('heading', { name: /Vous avez tout vu/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Charger d’autres propositions' }))
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('mouvement réduit : aucune animation n’est lancée, le swipe aboutit quand même', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: true, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }) as MediaQueryList,
    )
    const animate = vi.spyOn(Element.prototype, 'animate')
    const user = userEvent.setup()
    render(<SwipeDeck authed items={items} />)

    await user.click(screen.getByRole('button', { name: 'Aimer' }))
    await screen.findByLabelText('Œuvre 2')
    expect(animate).not.toHaveBeenCalled()

    matchMedia.mockRestore()
    animate.mockRestore()
  })

  it('la carte suivante est déjà rendue sous la carte courante, hors de l’arbre accessible', () => {
    render(<SwipeDeck authed items={items} />)
    const hidden = document.querySelector('[inert]')
    expect(hidden).not.toBeNull()
    expect(hidden).toHaveTextContent('Œuvre 2')
    expect(screen.queryByLabelText('Œuvre 2')).not.toBeInTheDocument()
  })
})
