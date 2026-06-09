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

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/discover" className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--color-accent)] text-sm font-bold text-white">
        O
      </span>
      {compact ? (
        <span className="text-base font-semibold tracking-[-0.03em] text-[color:var(--color-text)]">Offi</span>
      ) : (
        <span className="flex flex-col leading-tight">
          <span className="text-base font-semibold tracking-[-0.03em] text-[color:var(--color-text)]">Offi</span>
          <span className="text-xs text-[color:var(--color-text-muted)]">Découvertes à Paris</span>
        </span>
      )}
    </Link>
  )
}

function AccountBlock() {
  const { data: session, status } = useSession()
  if (status === 'loading') return null
  if (!session) {
    return (
      <Link href={SIGN_IN_PATH} className="btn btn-primary w-full justify-center">
        Se connecter
      </Link>
    )
  }
  const name = (session.user?.email ?? '').split('@')[0]
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2">
      <span className="truncate text-xs text-[color:var(--color-text-muted)]">{name}</span>
      <LogoutButton />
    </div>
  )
}

// Sidebar verticale (desktop ≥ lg). Structure constante d'une page à l'autre.
export function Sidebar() {
  const isActive = useActive()
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 border-r border-[color:var(--color-border)] px-3 py-5 lg:flex">
      <div className="px-2 pb-4">
        <Logo />
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-semibold transition',
                active
                  ? 'border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-strong)] text-[color:var(--color-text)]'
                  : 'text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-text)]',
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-3 px-1">
        <ThemeToggle />
        <AccountBlock />
      </div>
    </aside>
  )
}

// Bandeau haut compact (mobile < lg) : logo + thème + compte.
export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-topbar)] px-4 py-3 backdrop-blur-xl lg:hidden">
      <Logo compact />
      <div className="flex items-center gap-2">
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
      <Link href={SIGN_IN_PATH} className="btn btn-primary px-3 py-1.5 text-xs">
        Se connecter
      </Link>
    )
  }
  return <LogoutButton />
}

// Barre d'onglets en bas (mobile < lg) : navigation principale au pouce.
export function BottomNav() {
  const isActive = useActive()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-[color:var(--color-border)] bg-[color:var(--color-topbar)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      {NAV.map(({ href, label, Icon }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.66rem] font-semibold transition',
              active ? 'text-[color:var(--color-accent)]' : 'text-[color:var(--color-text-muted)]',
            )}
          >
            <Icon size={21} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
