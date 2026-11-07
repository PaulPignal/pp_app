'use client'

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import type { FriendRequestDto, FriendSummaryDto } from '@/features/friendships/dto'
import type { WorkCardDto } from '@/features/works/dto'
import CompactLikeCard from '@/features/reactions/ui/CompactLikeCard'
import { fetchJson } from '@/shared/lib/fetch-json'
import type { JsonOk } from '@/shared/lib/http'
import EmptyState from '@/shared/ui/EmptyState'
import { IconCheck, IconCopy } from '@/shared/ui/icons'
import SegmentedControl from '@/shared/ui/SegmentedControl'
import StatusBanner from '@/shared/ui/StatusBanner'

type FriendsClientProps = {
  initialFriends: FriendSummaryDto[]
  initialRequests: FriendRequestDto[]
  inviteToken: string
}

type AddFriendPayload = JsonOk<{
  friend: FriendSummaryDto
  status: 'accepted' | 'pending'
}>

type AcceptPayload = JsonOk<{ friend: FriendSummaryDto }>

type CommonPayload = JsonOk<{
  works: WorkCardDto[]
}>

function formatFriendsError(error: string) {
  switch (error) {
    case 'unauthorized':
      return 'Session expirée. Rechargez la page puis reconnectez-vous.'
    case 'invalid_invite_token':
      return 'Ce lien d’invitation est invalide.'
    case 'invalid_friend_input':
    case 'invalid_body':
      return 'Entrez une adresse email valide.'
    case 'expired_invite_token':
      return 'Ce lien d’invitation a expiré.'
    case 'cannot_add_self':
      return 'Vous ne pouvez pas vous ajouter vous-même.'
    case 'friend_not_found':
      return 'Aucun compte Offi ne correspond à cet email.'
    case 'request_not_found':
      return 'Cette demande n’existe plus.'
    case 'forbidden':
      return 'Cette personne n’est pas encore dans votre liste d’amis.'
    default:
      return 'Une erreur est survenue. Réessayez.'
  }
}

function initialsFromEmail(email: string) {
  const local = email.split('@')[0] ?? email
  return local.slice(0, 2).toUpperCase()
}

function Avatar({ email }: { email: string }) {
  return (
    <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fill text-xs font-semibold text-ink-muted">
      {initialsFromEmail(email)}
    </span>
  )
}

export default function FriendsClient({ initialFriends, initialRequests, inviteToken }: FriendsClientProps) {
  const searchParams = useSearchParams()
  const [friends, setFriends] = useState(initialFriends)
  const [requests, setRequests] = useState(initialRequests)
  const [commons, setCommons] = useState<CommonPayload['works']>([])
  const [emailInput, setEmailInput] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null)
  const [addMode, setAddMode] = useState<'email' | 'link'>('email')
  const [copied, setCopied] = useState(false)
  const acceptedTokenRef = useRef(false)
  const emailId = useId()

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

  function removeRequest(requesterId: string) {
    setRequests((current) => current.filter((item) => item.id !== requesterId))
  }

  // Arrivée via un lien d'invitation (?token=) → consentement explicite par le clic :
  // on accepte automatiquement, une seule fois, puis on nettoie l'URL.
  useEffect(() => {
    const token = searchParams.get('token')
    if (!token || acceptedTokenRef.current) return
    acceptedTokenRef.current = true

    void (async () => {
      setPending('token')
      setError('')
      setNotice('')
      try {
        const payload = await fetchJson<AddFriendPayload>('/api/friends', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        upsertFriend(payload.friend)
        setNotice(`${payload.friend.email} fait désormais partie de vos amis.`)
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : 'unknown_error'
        setError(formatFriendsError(message))
      } finally {
        setPending(null)
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('token')
          window.history.replaceState({}, '', url)
        }
      }
    })()
  }, [searchParams])

  async function addFriendByEmail(event: FormEvent) {
    event.preventDefault()
    if (!emailInput || pending) return

    setPending('email')
    setError('')
    setNotice('')
    try {
      const payload = await fetchJson<AddFriendPayload>('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput }),
      })
      if (payload.status === 'accepted') {
        upsertFriend(payload.friend)
        setNotice(`${payload.friend.email} fait désormais partie de vos amis.`)
      } else {
        setNotice(`Invitation envoyée à ${payload.friend.email}. Elle apparaîtra dans vos amis une fois acceptée.`)
      }
      setEmailInput('')
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'unknown_error'
      setError(formatFriendsError(message))
    } finally {
      setPending(null)
    }
  }

  async function respondToRequest(requesterId: string, action: 'accept' | 'decline') {
    setPending(`${action}:${requesterId}`)
    setError('')
    setNotice('')
    try {
      if (action === 'accept') {
        const payload = await fetchJson<AcceptPayload>('/api/friends/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId, action }),
        })
        upsertFriend(payload.friend)
        removeRequest(requesterId)
        setNotice(`${payload.friend.email} fait désormais partie de vos amis.`)
      } else {
        await fetchJson<JsonOk<{ declined: boolean }>>('/api/friends/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requesterId, action }),
        })
        removeRequest(requesterId)
        setNotice('Demande refusée.')
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'unknown_error'
      setError(formatFriendsError(message))
    } finally {
      setPending(null)
    }
  }

  async function removeFriendById(friend: FriendSummaryDto) {
    setPending(`remove:${friend.id}`)
    setError('')
    setNotice('')
    try {
      await fetchJson<JsonOk<{ removed: boolean }>>(`/api/friends?friendId=${encodeURIComponent(friend.id)}`, {
        method: 'DELETE',
      })
      setFriends((current) => current.filter((item) => item.id !== friend.id))
      if (selectedFriendId === friend.id) {
        setSelectedFriendId(null)
        setCommons([])
      }
      setNotice(`${friend.email} a été retiré de vos amis.`)
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
      setCopied(true)
      setError('')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Impossible de copier le lien automatiquement. Sélectionnez-le et copiez-le à la main.')
    } finally {
      setPending(null)
    }
  }

  async function loadCommon(friendId: string) {
    if (selectedFriendId === friendId && pending !== 'common') {
      setSelectedFriendId(null)
      setCommons([])
      return
    }

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="sr-only">Amis</h1>

      {error ? (
        <StatusBanner tone="error" floating onDismiss={() => setError('')}>
          {error}
        </StatusBanner>
      ) : null}
      {notice ? (
        <StatusBanner tone="success" floating onDismiss={() => setNotice('')}>
          {notice}
        </StatusBanner>
      ) : null}

      <section className="card flex flex-col gap-4 p-5" aria-labelledby="friends-add-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="friends-add-title" className="display text-xl text-ink">
            Ajouter un ami
          </h2>
          <SegmentedControl
            ariaLabel="Mode d’ajout"
            value={addMode}
            wrap
            onChange={(value) => setAddMode(value as 'email' | 'link')}
            items={[
              { label: 'Par email', value: 'email' },
              { label: 'Par lien', value: 'link' },
            ]}
          />
        </div>

        {addMode === 'email' ? (
          <form onSubmit={addFriendByEmail} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor={emailId} className="label">
                Email de votre ami
              </label>
              <input
                id={emailId}
                className="input"
                placeholder="email@exemple.com"
                type="email"
                autoComplete="off"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
              />
              <p className="field-hint">Il doit déjà avoir un compte Offi. Il recevra votre demande à sa prochaine visite.</p>
            </div>
            <button type="submit" className="btn btn-primary sm:mb-6" disabled={!emailInput || pending !== null}>
              {pending === 'email' ? 'Envoi…' : 'Inviter'}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="friends-invite-url" className="label">
                Mon lien d’invitation
              </label>
              <input id="friends-invite-url" className="input text-sm" readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
              <p className="field-hint">Qui ouvre ce lien connecté à son compte devient votre ami.</p>
            </div>
            <button type="button" className="btn btn-secondary sm:mb-6" onClick={() => void copyInviteUrl()} disabled={!inviteUrl || pending !== null}>
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>
        )}
      </section>

      {requests.length > 0 ? (
        <section className="card flex flex-col gap-4 p-5" aria-labelledby="friends-requests-title">
          <h2 id="friends-requests-title" className="display text-xl text-ink">
            Demandes reçues <span className="text-ink-muted">{requests.length}</span>
          </h2>
          <ul className="flex flex-col divide-y divide-line">
            {requests.map((request) => {
              const isAccepting = pending === `accept:${request.id}`
              const isDeclining = pending === `decline:${request.id}`
              return (
                <li key={request.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar email={request.email} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{request.email}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button className="btn btn-primary px-4" onClick={() => void respondToRequest(request.id, 'accept')} disabled={pending !== null}>
                      {isAccepting ? 'Ajout…' : 'Accepter'}
                    </button>
                    <button className="btn btn-ghost px-3" onClick={() => void respondToRequest(request.id, 'decline')} disabled={pending !== null}>
                      {isDeclining ? 'Refus…' : 'Refuser'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section className="card flex flex-col gap-4 p-5" aria-labelledby="friends-list-title">
        <h2 id="friends-list-title" className="display text-xl text-ink">
          Mes amis <span className="text-ink-muted">{friends.length}</span>
        </h2>

        {friends.length === 0 ? (
          <EmptyState variant="inline" title="Aucun ami pour le moment.">
            Invitez quelqu’un par email ou partagez votre lien : vous verrez ensuite les sorties que vous aimez tous les deux.
          </EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {friends.map((friend) => {
              const isExpanded = selectedFriendId === friend.id
              const isLoadingCommon = pending === 'common' && isExpanded
              const isRemoving = pending === `remove:${friend.id}`

              return (
                <li key={friend.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar email={friend.email} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{friend.email}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        className="btn btn-secondary px-4"
                        onClick={() => void loadCommon(friend.id)}
                        disabled={pending !== null && !isLoadingCommon}
                        aria-expanded={isExpanded}
                      >
                        {isLoadingCommon ? 'Chargement…' : isExpanded ? 'Masquer' : 'En commun'}
                      </button>
                      <button
                        className="btn btn-ghost px-3"
                        onClick={() => void removeFriendById(friend)}
                        disabled={pending !== null}
                        aria-label={`Retirer ${friend.email}`}
                      >
                        {isRemoving ? 'Retrait…' : 'Retirer'}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-3 flex flex-col gap-3">
                      {isLoadingCommon ? (
                        <p role="status" className="text-sm text-ink-muted">
                          Recherche des œuvres en commun…
                        </p>
                      ) : commons.length === 0 ? (
                        <EmptyState variant="inline" title="Aucune œuvre en commun pour le moment.">
                          Dès que vous aimerez tous les deux la même sortie, elle apparaîtra ici.
                        </EmptyState>
                      ) : (
                        <>
                          <p className="text-sm text-ink-muted">
                            {commons.length} {commons.length > 1 ? 'œuvres aimées' : 'œuvre aimée'} par vous deux.
                          </p>
                          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {commons.map((work) => (
                              <li key={work?.id ?? `${friend.id}-${work?.sourceUrl ?? work?.title ?? 'work'}`}>
                                <CompactLikeCard work={work} fallbackTitle="Œuvre commune" friends={[]} />
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
