'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import LogoutButton from '@/features/auth/ui/LogoutButton'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      className={active ? 'underline underline-offset-4' : 'hover:underline underline-offset-4'}
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
    <nav className="container mx-auto flex items-center gap-6 p-4 text-sm font-medium">
      <NavLink href="/discover">Découverte</NavLink>
      <NavLink href="/likes">Mes likes</NavLink>
      <NavLink href="/friends">Amis</NavLink>

      <span className="ml-auto text-xs text-neutral-500">
        Source:{' '}
        <a className="underline" href="https://www.offi.fr" target="_blank" rel="noreferrer">
          offi.fr
        </a>
      </span>

      <div className="mx-2 h-5 w-px bg-neutral-300" />

      {status === 'loading' ? (
        <span className="text-xs text-neutral-500">…</span>
      ) : session ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-700">Bienvenue {userName}</span>
          <LogoutButton />
        </div>
      ) : (
        <Link className="rounded bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-800" href={SIGN_IN_PATH}>
          Se connecter
        </Link>
      )}
    </nav>
  )
}
