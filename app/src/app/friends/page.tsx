import { requireSessionUserOrRedirect } from '@/features/auth/server/session'
import { createInviteToken } from '@/features/friendships/server/invite'
import { listFriends, listIncomingRequests } from '@/features/friendships/server/queries'
import FriendsClient from '@/features/friendships/ui/FriendsClient'

export default async function FriendsPage() {
  const sessionUser = await requireSessionUserOrRedirect()

  const [friends, requests, inviteToken] = await Promise.all([
    listFriends(sessionUser.id),
    listIncomingRequests(sessionUser.id),
    Promise.resolve(createInviteToken(sessionUser.id)),
  ])

  return <FriendsClient initialFriends={friends} initialRequests={requests} inviteToken={inviteToken} />
}
