'use client'

import { FormEvent, Suspense, useId, useState } from 'react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { safeCallbackUrl } from '@/features/auth/callback-url'
import StatusBanner from '@/shared/ui/StatusBanner'
import SurfaceCard from '@/shared/ui/SurfaceCard'

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-lg" aria-hidden />}>
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
  const callbackUrl = safeCallbackUrl(params.get('callbackUrl'))
  const emailId = useId()
  const passwordId = useId()

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
    <SurfaceCard className="p-6 sm:p-8">
      <h1 className="display text-2xl text-ink">Connexion</h1>
      <p className="mt-1 text-sm text-ink-muted">Retrouvez vos likes et ce que vos amis aiment.</p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
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
            aria-invalid={error ? true : undefined}
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
            autoComplete="current-password"
            aria-invalid={error ? true : undefined}
          />
        </div>
        {error ? <StatusBanner tone="error">{error}</StatusBanner> : null}
        <button type="submit" disabled={loading} className="btn btn-primary mt-2 w-full">
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <p className="mt-6 border-t border-line pt-5 text-sm text-ink-muted">
        Pas encore de compte ?{' '}
        <Link href="/signup" className="link">
          Créer un compte
        </Link>
      </p>
    </SurfaceCard>
  )
}
