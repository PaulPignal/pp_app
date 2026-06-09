import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <div aria-label={alt} data-testid="mock-image" />,
}))

import LikesLibrary, { type LikedItem } from '@/features/reactions/ui/LikesLibrary'
import type { WorkCardDto } from '@/features/works/dto'

function makeItem(id: string, title: string, over: Partial<WorkCardDto> = {}): LikedItem {
  return {
    workId: id,
    work: {
      id,
      title,
      section: 'theatre',
      imageUrl: null,
      category: null,
      venue: null,
      address: null,
      description: null,
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
      sourceUrl: null,
      venueInfo: null,
      ...over,
    },
  }
}

function jsonOk(payload: unknown = { ok: true, reaction: { id: 'r', status: 'DISLIKE' } }) {
  return { ok: true, status: 200, text: async () => JSON.stringify(payload) } as Response
}

async function openDetail(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(`Voir le détail de ${title}`) }))
  return screen.getByRole('dialog')
}

describe('LikesLibrary', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockResolvedValue(jsonOk())
  })

  it('ouvre le détail au clic et « Retirer » sort la carte optimistiquement (DISLIKE)', async () => {
    const user = userEvent.setup()
    render(<LikesLibrary current={[makeItem('w1', 'Hamlet')]} archived={[]} seen={[]} friendsByWork={{}} view="all" />)

    const dialog = await openDetail(user, 'Hamlet')
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/reactions',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ workId: 'w1', status: 'DISLIKE' }) }),
      ),
    )
    expect(screen.queryByText('Hamlet')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
  }, 15000)

  it('« Annuler » restaure la carte et poste LIKE', async () => {
    const user = userEvent.setup()
    render(<LikesLibrary current={[makeItem('w1', 'Hamlet')]} archived={[]} seen={[]} friendsByWork={{}} view="all" />)

    const dialog = await openDetail(user, 'Hamlet')
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }))
    await user.click(await screen.findByRole('button', { name: 'Annuler' }))

    await screen.findByRole('button', { name: /Voir le détail de Hamlet/ })
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/reactions',
      expect.objectContaining({ body: JSON.stringify({ workId: 'w1', status: 'LIKE' }) }),
    )
  }, 15000)

  it('« Marquer vu » poste SEEN et déplace l’œuvre hors des likes', async () => {
    const user = userEvent.setup()
    render(<LikesLibrary current={[makeItem('w1', 'Hamlet')]} archived={[]} seen={[]} friendsByWork={{}} view="active" />)

    const dialog = await openDetail(user, 'Hamlet')
    await user.click(within(dialog).getByRole('button', { name: 'Marquer vu' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/reactions',
        expect.objectContaining({ body: JSON.stringify({ workId: 'w1', status: 'SEEN' }) }),
      ),
    )
    expect(screen.queryByRole('button', { name: /Voir le détail de Hamlet/ })).not.toBeInTheDocument()
  }, 15000)

  it('la recherche filtre les cartes', async () => {
    const user = userEvent.setup()
    render(
      <LikesLibrary
        current={[makeItem('w1', 'Hamlet'), makeItem('w2', 'Macbeth')]}
        archived={[]}
        seen={[]}
        friendsByWork={{}}
        view="all"
      />,
    )

    await user.type(screen.getByLabelText('Rechercher dans mes likes'), 'mac')
    expect(screen.queryByRole('button', { name: /Voir le détail de Hamlet/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Voir le détail de Macbeth/ })).toBeInTheDocument()
  }, 15000)

  it('affiche le badge « amis qui aiment aussi »', () => {
    render(
      <LikesLibrary
        current={[makeItem('w1', 'Hamlet')]}
        archived={[]}
        seen={[]}
        friendsByWork={{ w1: [{ id: 'f1', email: 'lea@example.com' }] }}
        view="all"
      />,
    )
    expect(screen.getByText('LE')).toBeInTheDocument() // initiales de lea@
  })
})
