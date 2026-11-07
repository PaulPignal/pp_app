import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const signInMock = vi.fn()
const replaceMock = vi.fn()
vi.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => signInMock(...args) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('callbackUrl=%2Flikes'),
}))

import SignInPage from '@/app/(auth)/signin/page'
import SignUpPage from '@/app/(auth)/signup/page'

describe('Connexion', () => {
  beforeEach(() => {
    signInMock.mockReset()
    replaceMock.mockReset()
    vi.mocked(fetch).mockReset()
  })

  it('les champs ont un libellé associé et le titre est visible', () => {
    render(<SignInPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Connexion' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('link', { name: 'Créer un compte' })).toHaveAttribute('href', '/signup')
  })

  it('identifiants refusés : une alerte explicite, les champs marqués invalides', async () => {
    signInMock.mockResolvedValue({ error: 'CredentialsSignin' })
    const user = userEvent.setup()
    render(<SignInPage />)

    await user.type(screen.getByLabelText('Email'), 'paul@example.com')
    await user.type(screen.getByLabelText('Mot de passe'), 'mauvais-mot-de-passe')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Email ou mot de passe incorrect.')
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('connexion réussie : redirige vers la page demandée', async () => {
    signInMock.mockResolvedValue({ ok: true, error: null })
    const user = userEvent.setup()
    render(<SignInPage />)

    await user.type(screen.getByLabelText('Email'), 'paul@example.com')
    await user.type(screen.getByLabelText('Mot de passe'), 'Offi-Test-2026!')
    await user.click(screen.getByRole('button', { name: 'Se connecter' }))

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/likes'))
  })
})

describe('Inscription', () => {
  beforeEach(() => {
    signInMock.mockReset()
    replaceMock.mockReset()
    vi.mocked(fetch).mockReset()
  })

  it('mot de passe trop faible : alerte immédiate, aucun appel serveur', async () => {
    const user = userEvent.setup()
    render(<SignUpPage />)

    await user.type(screen.getByLabelText('Email'), 'paul@example.com')
    await user.type(screen.getByLabelText('Mot de passe'), 'tropcourt')
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('12 caractères minimum')
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Mot de passe')).toHaveAccessibleDescription(/12 caractères minimum/)
  })

  it('inscription valide : envoie l’email normalisé puis connecte', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
    signInMock.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<SignUpPage />)

    await user.type(screen.getByLabelText('Email'), '  Paul@Example.com ')
    await user.type(screen.getByLabelText('Mot de passe'), 'Offi-Test-2026!')
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/register',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'paul@example.com', password: 'Offi-Test-2026!' }) }),
      ),
    )
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
  })

  it('email déjà utilisé : message dédié renvoyé par le serveur', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: 'email_exists' }) } as Response)
    const user = userEvent.setup()
    render(<SignUpPage />)

    await user.type(screen.getByLabelText('Email'), 'paul@example.com')
    await user.type(screen.getByLabelText('Mot de passe'), 'Offi-Test-2026!')
    await user.click(screen.getByRole('button', { name: 'Créer le compte' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Un compte existe déjà')
  })
})
