'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import LogoutButton from '@/features/auth/ui/LogoutButton'
import { cn } from '@/shared/lib/cn'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center rounded-full border border-transparent px-4 py-2 text-sm font-semibold tracking-[-0.01em] transition',
        active
          ? 'border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-strong)] text-[color:var(--color-text)] shadow-[0_12px_30px_rgba(42,30,18,0.08)]'
          : 'text-[color:var(--color-text-muted)] hover:border-[color:var(--color-border)] hover:bg-white/70 hover:text-[color:var(--color-text)]',
      )}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  )
}

export default function NavBar() {
  const { data: session, status } = useSession()
  const userEmail = session?.user?.email ?? ''
  const userName = userEmail.split('@')[0] || userEmail

  return (
    <nav className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center">
      <div className="flex items-center gap-3">
        <Link href="/discover" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--color-accent)] text-sm font-bold text-white shadow-[0_14px_30px_rgba(15,93,94,0.25)]">
            O
          </span>
          <div>
            <div className="text-base font-semibold tracking-[-0.03em] text-[color:var(--color-text)]">Offi</div>
            <div className="text-xs text-[color:var(--color-text-muted)]">Découvertes culturelles à Paris</div>
          </div>
        </Link>

        {status === 'loading' ? (
          <span className="ml-auto rounded-full border border-[color:var(--color-border)] px-3 py-1 text-xs text-[color:var(--color-text-muted)] lg:hidden">
            Chargement
          </span>
        ) : session ? (
          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <span className="rounded-full border border-[color:var(--color-border)] bg-white/70 px-3 py-1 text-xs text-[color:var(--color-text-muted)]">
              {userName}
            </span>
            <LogoutButton />
          </div>
        ) : (
          <Link className="btn btn-primary ml-auto lg:hidden" href={SIGN_IN_PATH}>
            Se connecter
          </Link>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <NavLink href="/discover">Decouverte</NavLink>
          <NavLink href="/likes">Mes likes</NavLink>
          <NavLink href="/friends">Amis</NavLink>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            className="text-xs font-medium text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-text)]"
            href="https://www.offi.fr"
            target="_blank"
            rel="noreferrer"
          >
            Source: offi.fr
          </a>

          {status === 'loading' ? (
            <span className="rounded-full border border-[color:var(--color-border)] px-3 py-1 text-xs text-[color:var(--color-text-muted)]">
              Chargement
            </span>
          ) : session ? (
            <div className="flex items-center gap-3 rounded-full border border-[color:var(--color-border)] bg-white/80 px-3 py-2">
              <span className="text-xs font-medium text-[color:var(--color-text-muted)]">Connecté en tant que {userName}</span>
              <LogoutButton />
            </div>
          ) : (
            <Link className="btn btn-primary" href={SIGN_IN_PATH}>
              Se connecter
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 lg:hidden">
        <a
          className="text-xs font-medium text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-text)]"
          href="https://www.offi.fr"
          target="_blank"
          rel="noreferrer"
        >
          Source: offi.fr
        </a>
        {status === 'loading' ? (
          <span className="text-xs text-[color:var(--color-text-muted)]">Chargement</span>
        ) : null}
      </div>
    </nav>
  )
}
