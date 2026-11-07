import type { Metadata } from 'next'
import { requireSessionUserOrRedirect } from '@/features/auth/server/session'
import { createInviteToken } from '@/features/friendships/server/invite'
import { getInvitePreview, listFriends, listIncomingRequests } from '@/features/friendships/server/queries'
import FriendsClient from '@/features/friendships/ui/FriendsClient'

export const metadata: Metadata = { title: 'Amis' }

type FriendsPageProps = {
  searchParams?: Promise<{ token?: string | string[] }>
}

export default async function FriendsPage({ searchParams }: FriendsPageProps = {}) {
  const sessionUser = await requireSessionUserOrRedirect()
  const token = (await searchParams)?.token
  const inviteParam = Array.isArray(token) ? token[0] : token

  const [friends, requests, invitation] = await Promise.all([
    listFriends(sessionUser.id),
    listIncomingRequests(sessionUser.id),
    inviteParam ? getInvitePreview(sessionUser.id, inviteParam) : null,
  ])

  return (
    <FriendsClient
      initialFriends={friends}
      initialRequests={requests}
      inviteToken={createInviteToken(sessionUser.id)}
      invitation={invitation}
    />
  )
}
