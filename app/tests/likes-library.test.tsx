import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <div aria-label={alt} data-testid="mock-image" />,
}))

import LikesLibrary, { type LikedItem } from '@/features/reactions/ui/LikesLibrary'

function makeItem(
  id: string,
  title: string,
  credits?: { director?: string | null; cast?: string[]; section?: 'theatre' | 'cinema' },
): LikedItem {
  return {
    workId: id,
    work: {
      id,
      title,
      section: credits?.section ?? 'theatre',
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
      director: credits?.director ?? null,
      cast: credits?.cast ?? [],
      sourceUrl: null,
    },
  }
}

function jsonResponse(ok: boolean, status: string) {
  return {
    ok,
    status: ok ? 200 : 500,
    text: async () => JSON.stringify(ok ? { ok: true, reaction: { id: 'r', status } } : { ok: false, error: 'server_error' }),
  } as Response
}

describe('LikesLibrary', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockResolvedValue(jsonResponse(true, 'DISLIKE'))
  })

  it('« Retirer » sort la carte optimistiquement et poste DISLIKE (pas de router.refresh)', async () => {
    const user = userEvent.setup()
    render(<LikesLibrary current={[makeItem('w1', 'Hamlet')]} archived={[]} view="all" />)

    expect(screen.getByText('Hamlet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retirer' }))

    expect(screen.queryByText('Hamlet')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/reactions',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ workId: 'w1', status: 'DISLIKE' }) }),
      ),
    )
    expect(screen.getByText(/retiré de tes likes/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
  })

  it('« Marquer vu » poste SEEN avec un message explicite', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue(jsonResponse(true, 'SEEN'))
    render(<LikesLibrary current={[makeItem('w1', 'Hamlet')]} archived={[]} view="all" />)

    await user.click(screen.getByRole('button', { name: 'Marquer vu' }))

    expect(screen.queryByText('Hamlet')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/reactions',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ workId: 'w1', status: 'SEEN' }) }),
      ),
    )
    expect(screen.getByText(/marqué comme vu/i)).toBeInTheDocument()
  })

  it('« Annuler » restaure la carte et poste LIKE', async () => {
    const user = userEvent.setup()
    render(<LikesLibrary current={[makeItem('w1', 'Hamlet')]} archived={[]} view="all" />)

    await user.click(screen.getByRole('button', { name: 'Retirer' }))
    await screen.findByRole('button', { name: 'Annuler' })

    vi.mocked(fetch).mockResolvedValue(jsonResponse(true, 'LIKE'))
    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    await screen.findByText('Hamlet')
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/reactions',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ workId: 'w1', status: 'LIKE' }) }),
    )
  })

  it('affiche le réalisateur et le casting sur la carte', () => {
    render(
      <LikesLibrary
        current={[makeItem('w1', 'Voyage au bout de l’enfer', { section: 'cinema', director: 'Michael Cimino', cast: ['Robert De Niro', 'Christopher Walken'] })]}
        archived={[]}
        view="all"
      />,
    )

    expect(screen.getByText('Michael Cimino')).toBeInTheDocument()
    expect(screen.getByText('Robert De Niro, Christopher Walken')).toBeInTheDocument()
    expect(screen.getByText(/^De$/)).toBeInTheDocument()
  })

  it('rollback : si le POST échoue, la carte revient avec un message d’erreur', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue(jsonResponse(false, 'DISLIKE'))
    render(<LikesLibrary current={[makeItem('w1', 'Hamlet')]} archived={[]} view="all" />)

    await user.click(screen.getByRole('button', { name: 'Retirer' }))

    await screen.findByText('Hamlet')
    expect(screen.getByText(/non enregistrée/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument()
  })
})
