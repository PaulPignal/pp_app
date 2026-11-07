'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import LogoutButton from '@/features/auth/ui/LogoutButton'
import ThemeToggle from '@/shared/ui/ThemeToggle'
import { IconCompass, IconHeart, IconUsers } from '@/shared/ui/icons'
import { cn } from '@/shared/lib/cn'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

type NavItem = { href: string; label: string; Icon: typeof IconCompass }

const NAV: NavItem[] = [
  { href: '/discover', label: 'Découverte', Icon: IconCompass },
  { href: '/likes', label: 'Mes likes', Icon: IconHeart },
  { href: '/friends', label: 'Amis', Icon: IconUsers },
]

function useActive() {
  const pathname = usePathname() ?? ''
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`)
}

// Marque : un mot en Newsreader, pas de pictogramme. Le lien porte un libellé complet.
export function Wordmark({ tagline = false }: { tagline?: boolean }) {
  return (
    <Link href="/discover" aria-label="Offi, retour à la découverte" className="inline-flex min-h-11 flex-col justify-center leading-none">
      <span aria-hidden className="display text-2xl text-ink">
        Offi
      </span>
      {tagline ? (
        <span aria-hidden className="mt-1 text-xs text-ink-muted">
          Sorties à Paris
        </span>
      ) : null}
    </Link>
  )
}

function AccountBlock() {
  const { data: session, status } = useSession()
  if (status === 'loading') return <div className="skeleton h-11" aria-hidden />
  if (!session) {
    return (
      <Link href={SIGN_IN_PATH} className="btn btn-primary w-full">
        Se connecter
      </Link>
    )
  }
  const email = session.user?.email ?? ''
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
      <span className="truncate text-xs text-ink-muted" title={email}>
        {email}
      </span>
      <LogoutButton variant="icon" />
    </div>
  )
}

// Barre latérale (desktop ≥ lg). Structure constante d'une page à l'autre.
export function Sidebar() {
  const isActive = useActive()
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
      <div className="px-3 pb-8">
        <Wordmark tagline />
      </div>
      <nav aria-label="Navigation principale" className="flex flex-col gap-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors duration-150',
                active ? 'bg-fill text-ink' : 'text-ink-muted hover:bg-fill hover:text-ink',
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <ThemeToggle variant="row" />
        <AccountBlock />
      </div>
    </aside>
  )
}

// Bandeau haut compact (mobile < lg) : marque + thème + compte.
export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-topbar px-4 backdrop-blur-md lg:hidden">
      <Wordmark />
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <MobileAccount />
      </div>
    </header>
  )
}

function MobileAccount() {
  const { data: session, status } = useSession()
  if (status === 'loading') return null
  if (!session) {
    return (
      <Link href={SIGN_IN_PATH} className="btn btn-primary min-h-10 px-4">
        Se connecter
      </Link>
    )
  }
  return <LogoutButton variant="icon" />
}

// Barre d'onglets en bas (mobile < lg) : navigation principale au pouce.
export function BottomNav() {
  const isActive = useActive()
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-line bg-topbar pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      {NAV.map(({ href, label, Icon }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors duration-150',
              active ? 'text-accent' : 'text-ink-muted',
            )}
          >
            <Icon size={22} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
