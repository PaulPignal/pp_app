import { redirect } from 'next/navigation'
import { requireSessionUser } from '@/features/auth/server/session'
import { createInviteToken } from '@/features/friendships/server/invite'
import { listFriends } from '@/features/friendships/server/queries'
import FriendsClient from '@/features/friendships/ui/FriendsClient'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

export default async function FriendsPage() {
  let sessionUser
  try {
    sessionUser = await requireSessionUser()
  } catch {
    redirect(SIGN_IN_PATH)
  }

  const [friends, inviteToken] = await Promise.all([
    listFriends(sessionUser.id),
    Promise.resolve(createInviteToken(sessionUser.id)),
  ])

  return <FriendsClient initialFriends={friends} inviteToken={inviteToken} />
}
