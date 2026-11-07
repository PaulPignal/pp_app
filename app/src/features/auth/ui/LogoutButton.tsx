'use client'

import { signOut } from 'next-auth/react'
import { IconLogout } from '@/shared/ui/icons'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

type Props = { variant?: 'text' | 'icon' }

export default function LogoutButton({ variant = 'text' }: Props) {
  const onClick = () => signOut({ callbackUrl: SIGN_IN_PATH })
  if (variant === 'icon') {
    return (
      <button type="button" onClick={onClick} className="btn-icon" aria-label="Se déconnecter" title="Se déconnecter">
        <IconLogout size={20} />
      </button>
    )
  }
  return (
    <button type="button" onClick={onClick} className="btn btn-ghost">
      Se déconnecter
    </button>
  )
}
