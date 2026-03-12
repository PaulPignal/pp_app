'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import NavBar from '@/features/auth/ui/NavBar'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

type AppShellProps = {
  children: ReactNode
}

const AUTH_PATHS = new Set([SIGN_IN_PATH, '/signup'])

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const isAuthRoute = pathname ? AUTH_PATHS.has(pathname) : false

  if (isAuthRoute) {
    return (
      <div className="app-auth-shell">
        <div className="app-auth-frame">
          <section className="auth-aside">
            <p className="page-eyebrow">Offi Premium</p>
            <div className="space-y-4">
              <h1 className="auth-title">Découvrir Paris comme une collection, pas comme une liste.</h1>
              <p className="auth-copy">
                Garde le rythme d&apos;une interface de productivité, avec une lecture plus éditoriale pour le théâtre et
                le cinéma.
              </p>
            </div>
            <div className="auth-highlight-grid">
              <div className="auth-highlight-card">
                <span className="auth-highlight-label">Découverte</span>
                <strong>Swipe clair, cartes lisibles, contexte utile.</strong>
              </div>
              <div className="auth-highlight-card">
                <span className="auth-highlight-label">Bibliothèque</span>
                <strong>Likes, amis et œuvres communes dans un même langage visuel.</strong>
              </div>
            </div>
          </section>
          <div className="auth-main">{children}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <NavBar />
      </header>
      <main className="app-content">{children}</main>
    </div>
  )
}
