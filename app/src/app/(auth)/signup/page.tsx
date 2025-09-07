// src/app/(auth)/signup/page.tsx
'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

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
    <main className="mx-auto mt-12 max-w-sm p-4">
      <h1 className="text-2xl font-semibold">Créer un compte</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <div>
          <label className="block text-sm">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2"
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-sm">Mot de passe (≥ 6 caractères)</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2"
            required
            minLength={6}
            autoComplete="new-password"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl border px-4 py-2"
        >
          {loading ? 'Création…' : 'Créer le compte'}
        </button>
      </form>

      <p className="mt-4 text-sm">
        Déjà inscrit ? <a href="/signin" className="underline">Se connecter</a>
      </p>
    </main>
  )
}
