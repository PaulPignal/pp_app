'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import LogoutButton from '@/components/LogoutButton'

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(href + '/')
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
  const userEmail = session?.user?.email || ''
  const userName = (session?.user as any)?.name || userEmail?.split('@')[0]

  return (
    <nav className="container mx-auto flex gap-6 p-4 text-sm font-medium items-center">
      <NavLink href="/discover">Découverte</NavLink>
      <NavLink href="/new">Nouveautés</NavLink>
      <NavLink href="/likes">Mes likes</NavLink>
      <NavLink href="/friends">Amis</NavLink>

      <span className="ml-auto text-xs text-neutral-500">
        Source:{' '}
        <a className="underline" href="https://www.offi.fr" target="_blank" rel="noreferrer">
          offi.fr
        </a>
      </span>

      {/* séparateur */}
      <div className="w-px h-5 bg-neutral-300 mx-2" />

      {status === 'loading' ? (
        <span className="text-xs text-neutral-500">…</span>
      ) : session ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-700">Bienvenue {userName}</span>
          <LogoutButton />
        </div>
      ) : (
        <Link
          className="rounded bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-800"
          href={process.env.NEXT_PUBLIC_SIGNIN_PATH || '/signin'}
        >
          Se connecter
        </Link>
      )}
    </nav>
  )
}
