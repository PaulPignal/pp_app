// src/app/(auth)/signup/page.tsx
'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import StatusBanner from '@/shared/ui/StatusBanner'
import SurfaceCard from '@/shared/ui/SurfaceCard'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      setLoading(false)
      setError((await res.json()).error || 'Inscription impossible')
      return
    }
    // connexion auto
    await signIn('credentials', { email, password, redirect: false })
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
            <label className="label">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <label className="label">Mot de passe (≥ 6 caractères)</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              required
              minLength={6}
              autoComplete="new-password"
            />
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
