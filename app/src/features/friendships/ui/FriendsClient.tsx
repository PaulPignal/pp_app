'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { FriendSummaryDto } from '@/features/friendships/dto'
import type { WorkCardDto } from '@/features/works/dto'
import { fetchJson } from '@/shared/lib/fetch-json'
import type { JsonOk } from '@/shared/lib/http'

type FriendsClientProps = {
  initialFriends: FriendSummaryDto[]
  inviteToken: string
}

type AddFriendPayload = JsonOk<{
  friend: FriendSummaryDto
}>

type CommonPayload = JsonOk<{
  works: WorkCardDto[]
}>

function formatFriendsError(error: string) {
  switch (error) {
    case 'unauthorized':
      return 'Session expirée. Recharge la page puis reconnecte-toi.'
    case 'invalid_invite_token':
      return "Le token d'invitation est invalide."
    case 'invalid_friend_input':
    case 'invalid_body':
      return "Entre un email valide ou un token d'invitation."
    case 'expired_invite_token':
      return "Le token d'invitation a expiré."
    case 'cannot_add_self':
      return "Tu ne peux pas t'ajouter toi-même."
    case 'friend_not_found':
      return "Le compte invité n'existe plus."
    case 'forbidden':
      return "Cette personne n'est pas encore dans ta liste d'amis."
    default:
      return 'Une erreur est survenue. Réessaie.'
  }
}

export default function FriendsClient({ initialFriends, inviteToken }: FriendsClientProps) {
  const searchParams = useSearchParams()
  const [friends, setFriends] = useState(initialFriends)
  const [commons, setCommons] = useState<WorkCardDto[]>([])
  const [emailInput, setEmailInput] = useState('')
  const [tokenInput, setTokenInput] = useState(() => searchParams.get('token') ?? '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState<'email' | 'token' | 'copy' | 'common' | null>(null)
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null)

  const inviteUrl = useMemo(() => {
    if (typeof window === 'undefined' || !inviteToken) return ''
    return `${window.location.origin}/friends?token=${inviteToken}`
  }, [inviteToken])

  function upsertFriend(friend: FriendSummaryDto) {
    setFriends((current) => {
      if (current.some((item) => item.id === friend.id)) {
        return current
      }
      return [...current, friend].sort((left, right) => left.email.localeCompare(right.email))
    })
  }

  async function addFriendByToken() {
    if (!tokenInput) return

    setPending('token')
    setError('')
    setNotice('')
    try {
      const payload = await fetchJson<AddFriendPayload>('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput }),
      })
      upsertFriend(payload.friend)
      setTokenInput('')
      setNotice('Ami ajouté.')
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('token')
        window.history.replaceState({}, '', url)
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'unknown_error'
      setError(formatFriendsError(message))
    } finally {
      setPending(null)
    }
  }

  async function addFriendByEmail() {
    if (!emailInput) return

    setPending('email')
    setError('')
    setNotice('')
    try {
      const payload = await fetchJson<AddFriendPayload>('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput }),
      })
      upsertFriend(payload.friend)
      setEmailInput('')
      setNotice('Ami ajouté.')
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'unknown_error'
      setError(formatFriendsError(message))
    } finally {
      setPending(null)
    }
  }

  async function copyInviteUrl() {
    if (!inviteUrl || !navigator.clipboard) return

    setPending('copy')
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setNotice('Lien copié.')
      setError('')
    } catch {
      setError('Impossible de copier le lien automatiquement.')
    } finally {
      setPending(null)
    }
  }

  async function loadCommon(friendId: string) {
    setPending('common')
    setSelectedFriendId(friendId)
    setError('')
    setNotice('')
    try {
      const payload = await fetchJson<CommonPayload>(`/api/common?friendId=${encodeURIComponent(friendId)}`)
      setCommons(payload.works)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'unknown_error'
      setCommons([])
      setError(formatFriendsError(message))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">Amis</h1>

      {error ? <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {notice ? (
        <p className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
      ) : null}

      <div className="card mb-4 space-y-3">
        <div>
          <div className="font-medium">Ajouter par email</div>
          <p className="mt-1 text-sm text-gray-500">Le plus simple si tu connais l&apos;email exact de la personne.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded border p-2"
            placeholder="email@exemple.com"
            type="email"
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
          />
          <button className="btn btn-primary" onClick={() => void addFriendByEmail()} disabled={!emailInput || pending !== null}>
            {pending === 'email' ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
      </div>

      <div className="card mb-4 space-y-3">
        <div>
          <div className="font-medium">Mon lien d&apos;invitation</div>
          <p className="mt-1 text-sm text-gray-500">Fallback si tu ne veux pas partager ton email ou si l&apos;autre personne préfère un lien.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="flex-1 rounded border p-2" readOnly value={inviteUrl} />
          <button className="btn" onClick={() => void copyInviteUrl()} disabled={!inviteUrl || pending !== null}>
            {pending === 'copy' ? 'Copie…' : 'Copier'}
          </button>
        </div>
      </div>

      <div className="card mb-6 space-y-3">
        <div className="font-medium">Ajouter avec un token</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded border p-2"
            placeholder="token reçu"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
          />
          <button className="btn btn-primary" onClick={() => void addFriendByToken()} disabled={!tokenInput || pending !== null}>
            {pending === 'token' ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="mb-3 text-lg font-semibold">Mes amis</h2>
        {friends.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun ami pour le moment.</p>
        ) : (
          <ul className="space-y-2">
            {friends.map((friend) => (
              <li key={friend.id} className="flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">{friend.email}</div>
                  <div className="text-sm text-muted-foreground">ID: {friend.id}</div>
                </div>
                <button
                  className="rounded-xl border px-3 py-1 text-sm disabled:opacity-50"
                  onClick={() => void loadCommon(friend.id)}
                  disabled={pending !== null}
                >
                  {pending === 'common' && selectedFriendId === friend.id ? 'Chargement…' : 'Œuvres en commun'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 text-lg font-semibold">Œuvres en commun</h2>
        {pending === 'common' ? <p className="text-sm text-muted-foreground">Chargement…</p> : null}
        {pending !== 'common' && selectedFriendId && commons.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune œuvre commune pour le moment.</p>
        ) : null}
        {commons.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {commons.map((work) => (
              <li key={work.id} className="rounded-2xl border p-2">
                <article>
                  <div className="relative h-40 w-full overflow-hidden rounded-xl bg-muted">
                    {work.imageUrl ? (
                      <Image
                        src={work.imageUrl}
                        alt={work.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 300px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Pas d’image</div>
                    )}
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-sm font-medium">{work.title}</h3>
                  {work.venue ? <p className="text-xs text-muted-foreground">{work.venue}</p> : null}
                  {work.sourceUrl ? (
                    <a
                      href={work.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block rounded-xl border px-3 py-1 text-sm"
                    >
                      Voir la source
                    </a>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
