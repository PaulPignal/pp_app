// src/app/(auth)/signin/page.tsx
'use client'

import { FormEvent, Suspense, useState } from 'react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import StatusBanner from '@/shared/ui/StatusBanner'
import SurfaceCard from '@/shared/ui/SurfaceCard'

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="skeleton h-[28rem] rounded-[1.75rem]" />}>
      <SignInInner />
    </Suspense>
  )
}

function SignInInner() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = params.get('callbackUrl') || '/'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await signIn('credentials', { email, password, redirect: false, callbackUrl })
    setLoading(false)
    if (res?.error) {
      setError('Email ou mot de passe incorrect.')
      return
    }
    router.replace(callbackUrl)
  }

  return (
    <div className="flex h-full items-center">
      <SurfaceCard tone="accent" className="mx-auto w-full max-w-xl space-y-6 p-6 sm:p-8">
        <div className="space-y-3">
          <p className="page-eyebrow">Connexion</p>
          <h1 className="page-title text-[clamp(1.9rem,4vw,2.7rem)]">Se connecter</h1>
          <p className="page-description">
            Retrouve ta pile de découvertes, tes likes et tes amis dans une interface plus calme et lisible.
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
            <label className="label">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              required
              autoComplete="current-password"
            />
          </div>
          {error ? <StatusBanner tone="error">{error}</StatusBanner> : null}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full justify-center"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <div className="space-y-2 border-t border-[color:var(--color-border)] pt-5">
          <p className="text-sm text-muted-foreground">Pas encore de compte ?</p>
          <Link href="/signup" className="text-sm font-semibold text-[color:var(--color-accent)] transition hover:underline">
            Créer un compte
          </Link>
        </div>
      </SurfaceCard>
    </div>
  )
}
