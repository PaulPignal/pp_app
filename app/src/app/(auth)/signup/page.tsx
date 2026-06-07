// src/app/(auth)/signup/page.tsx
'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { registerUserSchema } from '@/features/auth/schemas'
import StatusBanner from '@/shared/ui/StatusBanner'
import SurfaceCard from '@/shared/ui/SurfaceCard'

const PASSWORD_RULE = '12 caractères minimum, avec une majuscule, une minuscule et un chiffre.'

function registerErrorMessage(code?: string) {
  switch (code) {
    case 'email_exists':
      return 'Un compte existe déjà avec cet email. Connecte-toi plutôt.'
    case 'rate_limited':
      return 'Trop de tentatives. Réessaie dans une minute.'
    case 'invalid_body':
      return `Mot de passe trop faible : ${PASSWORD_RULE}`
    default:
      return 'Inscription impossible pour le moment. Réessaie.'
  }
}

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // Validation client via le même schéma que l'API (source de vérité unique).
    const parsed = registerUserSchema.safeParse({ email, password })
    if (!parsed.success) {
      const onPassword = parsed.error.issues.some((issue) => issue.path[0] === 'password')
      setError(onPassword ? `Mot de passe : ${PASSWORD_RULE}` : 'Entre une adresse email valide.')
      return
    }

    setLoading(true)
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    })

    if (!res.ok) {
      setLoading(false)
      const code = (await res.json().catch(() => ({}))).error as string | undefined
      setError(registerErrorMessage(code))
      return
    }

    // Connexion auto
    await signIn('credentials', { email: parsed.data.email, password, redirect: false })
    router.replace('/')
  }

  return (
    <div className="flex h-full items-center">
      <SurfaceCard tone="accent" className="mx-auto w-full max-w-xl space-y-6 p-6 sm:p-8">
        <div className="space-y-3">
          <p className="page-eyebrow">Inscription</p>
          <h1 className="page-title text-[clamp(1.9rem,4vw,2.7rem)]">Créer un compte</h1>
          <p className="page-description">
            Ouvre ton espace personnel pour construire une collection de sorties, partager des invitations et retrouver
            plus vite les oeuvres qui comptent.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="label" htmlFor="signup-email">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <label className="label" htmlFor="signup-password">
              Mot de passe
            </label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              required
              minLength={12}
              autoComplete="new-password"
              aria-describedby="signup-password-hint"
            />
            <p id="signup-password-hint" className="field-hint">
              {PASSWORD_RULE}
            </p>
          </div>
          {error ? <StatusBanner tone="error">{error}</StatusBanner> : null}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full justify-center"
          >
            {loading ? 'Création…' : 'Créer le compte'}
          </button>
        </form>

        <div className="space-y-2 border-t border-[color:var(--color-border)] pt-5">
          <p className="text-sm text-muted-foreground">Déjà inscrit ?</p>
          <Link href="/signin" className="text-sm font-semibold text-[color:var(--color-accent)] transition hover:underline">
            Se connecter
          </Link>
        </div>
      </SurfaceCard>
    </div>
  )
}
