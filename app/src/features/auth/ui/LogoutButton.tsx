'use client'

import { signOut } from 'next-auth/react'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: SIGN_IN_PATH })}
      className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
    >
      Se déconnecter
    </button>
  )
}
