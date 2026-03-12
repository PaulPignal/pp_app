'use client'

import { signOut } from 'next-auth/react'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: SIGN_IN_PATH })}
      className="btn btn-danger"
    >
      Se déconnecter
    </button>
  )
}
