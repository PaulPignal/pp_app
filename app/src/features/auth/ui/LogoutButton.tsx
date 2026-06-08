'use client'

import { signOut } from 'next-auth/react'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: SIGN_IN_PATH })}
      className="btn btn-ghost px-3 py-1.5 text-xs"
    >
      Se déconnecter
    </button>
  )
}
