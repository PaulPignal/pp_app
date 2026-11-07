'use client'

import { useId, useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE, isPasswordAcceptable } from '@/features/auth/password-policy'
import StatusBanner from '@/shared/ui/StatusBanner'
import SurfaceCard from '@/shared/ui/SurfaceCard'

function registerErrorMessage(code?: string) {
  switch (code) {
    case 'email_exists':
      return 'Un compte existe déjà avec cet email. Connectez-vous plutôt.'
    case 'rate_limited':
      return 'Trop de tentatives. Réessayez dans une minute.'
    case 'invalid_body':
      return `Mot de passe trop faible : ${PASSWORD_RULE}`
    default:
      return 'Inscription impossible pour le moment. Réessayez.'
  }
}

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const emailId = useId()
  const passwordId = useId()
  const hintId = useId()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // Contrôle immédiat (la même règle que le serveur, sans embarquer le schéma zod côté client).
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail.includes('@')) {
      setError('Entrez une adresse email valide.')
      return
    }
    if (!isPasswordAcceptable(password)) {
      setError(`Mot de passe : ${PASSWORD_RULE}`)
      return
    }

    setLoading(true)
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password }),
    })

    if (!res.ok) {
      setLoading(false)
      const code = (await res.json().catch(() => ({}))).error as string | undefined
      setError(registerErrorMessage(code))
      return
    }

    // Connexion auto
    await signIn('credentials', { email: normalizedEmail, password, redirect: false })
    router.replace('/')
  }

  return (
    <SurfaceCard className="p-6 sm:p-8">
      <h1 className="display text-2xl text-ink">Créer un compte</h1>
      <p className="mt-1 text-sm text-ink-muted">Pour garder vos coups de cœur et les partager avec vos amis.</p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <div>
          <label className="label" htmlFor={emailId}>
            Email
          </label>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="label" htmlFor={passwordId}>
            Mot de passe
          </label>
          <input
            id={passwordId}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            aria-describedby={hintId}
          />
          <p id={hintId} className="field-hint">
            {PASSWORD_RULE}
          </p>
        </div>
        {error ? <StatusBanner tone="error">{error}</StatusBanner> : null}
        <button type="submit" disabled={loading} className="btn btn-primary mt-2 w-full">
          {loading ? 'Création…' : 'Créer le compte'}
        </button>
      </form>

      <p className="mt-6 border-t border-line pt-5 text-sm text-ink-muted">
        Déjà inscrit ?{' '}
        <Link href="/signin" className="link">
          Se connecter
        </Link>
      </p>
    </SurfaceCard>
  )
}
