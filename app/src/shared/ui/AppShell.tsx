'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { BottomNav, MobileTopBar, Sidebar } from '@/features/auth/ui/AppNav'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

type AppShellProps = {
  children: ReactNode
}

const AUTH_PATHS = new Set([SIGN_IN_PATH, '/signup'])

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const isAuthRoute = pathname ? AUTH_PATHS.has(pathname) : false

  // Connexion / inscription : carte unique centrée, sans panneau marketing.
  if (isAuthRoute) {
    return (
      <div className="app-auth-shell">
        <div className="auth-main w-full max-w-md">{children}</div>
      </div>
    )
  }

  return (
    <div className="lg:flex">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <MobileTopBar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>
      <BottomNav />
    </div>
  )
}
