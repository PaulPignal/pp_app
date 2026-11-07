import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

import FriendsClient from '@/features/friendships/ui/FriendsClient'

function jsonResponse(payload: unknown) {
  return { ok: true, text: async () => JSON.stringify(payload) } as Response
}

describe('FriendsClient', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset()
  })

  it('invite par email → demande en attente (consentement), notice explicite', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ ok: true, friend: { id: 'friend-2', email: 'new@example.com' }, status: 'pending' }),
    )
    const user = userEvent.setup()
    render(<FriendsClient initialFriends={[]} initialRequests={[]} inviteToken="token-1" />)

    await user.type(screen.getByPlaceholderText('email@exemple.com'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Inviter' }))

    expect(fetch).toHaveBeenCalledWith(
      '/api/friends',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'new@example.com' }) }),
    )
    expect(await screen.findByText(/Invitation envoyée à new@example.com/i)).toBeInTheDocument()
    // pas ajouté à la liste d'amis tant que non accepté
    expect(screen.queryByText('Aucun ami pour le moment.')).toBeInTheDocument()
  }, 15000)

  it('accepter une demande reçue la déplace dans Mes amis', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true, friend: { id: 'req-1', email: 'req@example.com' } }))
    const user = userEvent.setup()
    render(
      <FriendsClient initialFriends={[]} initialRequests={[{ id: 'req-1', email: 'req@example.com' }]} inviteToken="token-1" />,
    )

    expect(screen.getByText(/Demandes reçues/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Accepter' }))

    expect(fetch).toHaveBeenCalledWith(
      '/api/friends/requests',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ requesterId: 'req-1', action: 'accept' }) }),
    )
    await waitFor(() => expect(screen.queryByText(/Demandes reçues/)).not.toBeInTheDocument())
    expect(screen.getByText('req@example.com')).toBeInTheDocument()
  }, 15000)

  it('retirer un ami le supprime de la liste', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true, removed: true }))
    const user = userEvent.setup()
    render(
      <FriendsClient initialFriends={[{ id: 'friend-1', email: 'friend@example.com' }]} initialRequests={[]} inviteToken="token-1" />,
    )

    await user.click(screen.getByRole('button', { name: 'Retirer friend@example.com' }))

    expect(fetch).toHaveBeenCalledWith(
      '/api/friends?friendId=friend-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    await waitFor(() => expect(screen.queryByText('friend@example.com')).not.toBeInTheDocument())
  }, 15000)

  it('Entrée dans le champ email envoie l’invitation (formulaire)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ ok: true, friend: { id: 'friend-2', email: 'new@example.com' }, status: 'pending' }),
    )
    const user = userEvent.setup()
    render(<FriendsClient initialFriends={[]} initialRequests={[]} inviteToken="token-1" />)

    await user.type(screen.getByLabelText('Email de votre ami'), 'new@example.com{Enter}')

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/friends', expect.objectContaining({ method: 'POST' })))
    expect(await screen.findByRole('status')).toHaveTextContent(/Invitation envoyée/)
  }, 15000)

  it('refuser une demande la retire sans ajouter d’ami', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true, declined: true }))
    const user = userEvent.setup()
    render(
      <FriendsClient initialFriends={[]} initialRequests={[{ id: 'req-1', email: 'req@example.com' }]} inviteToken="token-1" />,
    )

    await user.click(screen.getByRole('button', { name: 'Refuser' }))

    await waitFor(() => expect(screen.queryByText('req@example.com')).not.toBeInTheDocument())
    expect(screen.getByText('Aucun ami pour le moment.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Demande refusée.')
  }, 15000)

  it('mode lien : le lien d’invitation est lisible et « Copier » confirme la copie', async () => {
    // user-event installe son propre presse-papier : on relit ce qui a été copié.
    const user = userEvent.setup()
    render(<FriendsClient initialFriends={[]} initialRequests={[]} inviteToken="token-1" />)

    await user.click(screen.getByRole('radio', { name: 'Par lien' }))
    expect(screen.getByLabelText('Mon lien d’invitation')).toHaveValue(`${window.location.origin}/friends?token=token-1`)

    await user.click(screen.getByRole('button', { name: 'Copier' }))
    expect(await screen.findByRole('button', { name: 'Copié' })).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toContain('token=token-1')
  }, 15000)

  it('erreur serveur : une alerte explicite, que l’on peut fermer', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404, text: async () => JSON.stringify({ ok: false, error: 'friend_not_found' }) } as Response)
    const user = userEvent.setup()
    render(<FriendsClient initialFriends={[]} initialRequests={[]} inviteToken="token-1" />)

    await user.type(screen.getByLabelText('Email de votre ami'), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: 'Inviter' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Aucun compte Offi ne correspond à cet email.')
    await user.click(screen.getByRole('button', { name: 'Fermer le message' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  }, 15000)

  it('loads common works inline for a selected friend', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        works: [
          {
            id: 'work-1',
            title: 'Hamlet',
            section: 'theatre',
            imageUrl: null,
            category: null,
            venue: 'Comédie-Française',
            address: null,
            description: null,
            startDate: '2026-03-01T00:00:00.000Z',
            endDate: '2026-03-30T00:00:00.000Z',
            durationMin: 120,
            priceMin: 18,
            priceMax: 42,
            director: null,
            cast: [],
            sourceUrl: 'https://www.offi.fr/hamlet',
          },
        ],
      }),
    )

    const user = userEvent.setup()
    render(
      <FriendsClient initialFriends={[{ id: 'friend-1', email: 'friend@example.com' }]} initialRequests={[]} inviteToken="token-1" />,
    )

    await user.click(screen.getByRole('button', { name: /en commun/i }))

    expect(fetch).toHaveBeenCalledWith('/api/common?friendId=friend-1', undefined)
    expect(await screen.findByText('Hamlet')).toBeInTheDocument()
    expect(screen.getByText('Comédie-Française')).toBeInTheDocument()
  }, 15000)
})
