'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { BottomNav, MobileTopBar, Sidebar, Wordmark } from '@/features/auth/ui/AppNav'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

type AppShellProps = {
  children: ReactNode
}

const AUTH_PATHS = new Set([SIGN_IN_PATH, '/signup'])

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const isAuthRoute = pathname ? AUTH_PATHS.has(pathname) : false

  // Connexion / inscription : marque + carte unique centrée, sans navigation.
  if (isAuthRoute) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <div className="mb-6">
          <Wordmark tagline />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    )
  }

  return (
    <div className="lg:flex">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-raised focus:px-4 focus:py-2 focus:text-sm focus:font-semibold"
      >
        Aller au contenu
      </a>
      <Sidebar />
      <div className="flex min-h-dvh flex-1 flex-col">
        <MobileTopBar />
        <main
          id="contenu"
          className="mx-auto w-full max-w-5xl flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8"
        >
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
