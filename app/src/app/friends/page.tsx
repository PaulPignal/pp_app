import { requireSessionUserOrRedirect } from '@/features/auth/server/session'
import { createInviteToken } from '@/features/friendships/server/invite'
import { listFriends } from '@/features/friendships/server/queries'
import FriendsClient from '@/features/friendships/ui/FriendsClient'

export default async function FriendsPage() {
  const sessionUser = await requireSessionUserOrRedirect()

  const [friends, inviteToken] = await Promise.all([
    listFriends(sessionUser.id),
    Promise.resolve(createInviteToken(sessionUser.id)),
  ])

  return <FriendsClient initialFriends={friends} inviteToken={inviteToken} />
}
