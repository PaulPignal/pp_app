'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { FriendRequestDto, FriendSummaryDto } from '@/features/friendships/dto'
import type { WorkCardDto } from '@/features/works/dto'
import WorkSummaryCard from '@/features/works/ui/WorkSummaryCard'
import { fetchJson } from '@/shared/lib/fetch-json'
import type { JsonOk } from '@/shared/lib/http'
import PageHeader from '@/shared/ui/PageHeader'
import SegmentedControl from '@/shared/ui/SegmentedControl'
import StatusBanner from '@/shared/ui/StatusBanner'
import SurfaceCard from '@/shared/ui/SurfaceCard'

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
      return 'Session expirée. Recharge la page puis reconnecte-toi.'
    case 'invalid_invite_token':
      return "Le lien d'invitation est invalide."
    case 'invalid_friend_input':
    case 'invalid_body':
      return 'Entre un email valide.'
    case 'expired_invite_token':
      return "Le lien d'invitation a expiré."
    case 'cannot_add_self':
      return "Tu ne peux pas t'ajouter toi-même."
    case 'friend_not_found':
      return "Aucun compte Offi ne correspond à cet email."
    case 'request_not_found':
      return "Cette demande n'existe plus."
    case 'forbidden':
      return "Cette personne n'est pas encore dans ta liste d'amis."
    default:
      return 'Une erreur est survenue. Réessaie.'
  }
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
  const acceptedTokenRef = useRef(false)

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
        setNotice(`${payload.friend.email} fait désormais partie de tes amis.`)
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
      if (payload.status === 'accepted') {
        upsertFriend(payload.friend)
        setNotice(`${payload.friend.email} fait désormais partie de tes amis.`)
      } else {
        setNotice(`Invitation envoyée à ${payload.friend.email}. Elle apparaîtra dans tes amis une fois acceptée.`)
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
        setNotice(`${payload.friend.email} fait désormais partie de tes amis.`)
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
      setNotice(`${friend.email} a été retiré de tes amis.`)
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
    <div className="page-shell">
      <PageHeader
        eyebrow="Réseau"
        title="Amis"
        description="Invite quelqu'un par email ou par lien : la personne doit accepter avant que vous ne deveniez amis. Ouvre ensuite vos œuvres communes directement depuis sa ligne."
        meta={
          <>
            <span className="chip">{friends.length} ami{friends.length > 1 ? 's' : ''}</span>
            {requests.length > 0 ? <span className="chip">{requests.length} demande{requests.length > 1 ? 's' : ''} en attente</span> : null}
          </>
        }
      />

      {error ? <StatusBanner tone="error" floating>{error}</StatusBanner> : null}
      {notice ? <StatusBanner tone="success" floating>{notice}</StatusBanner> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="space-y-5">
          <SurfaceCard tone="accent" className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[color:var(--color-accent)]">
                Ajouter un ami
              </p>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Avec son consentement</h2>
              <p className="text-sm leading-7 text-muted-foreground">
                Par email, la personne reçoit une demande à accepter. Par lien, elle confirme en l&apos;ouvrant.
              </p>
            </div>

            <SegmentedControl
              ariaLabel="Choisir un mode d'ajout"
              value={addMode}
              onChange={(value) => setAddMode(value as 'email' | 'link')}
              fullWidth
              items={[
                { label: 'Par email', value: 'email' },
                { label: 'Par lien', value: 'link' },
              ]}
            />

            {addMode === 'email' ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="label">Inviter par email</label>
                  <p className="field-hint">La personne devra accepter ta demande pour devenir ton amie.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    className="input flex-1"
                    placeholder="email@exemple.com"
                    type="email"
                    value={emailInput}
                    onChange={(event) => setEmailInput(event.target.value)}
                  />
                  <button className="btn btn-primary" onClick={() => void addFriendByEmail()} disabled={!emailInput || pending !== null}>
                    {pending === 'email' ? 'Envoi…' : 'Inviter'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="label">Mon lien d&apos;invitation</label>
                  <p className="field-hint">
                    Partage ce lien : la personne devient ton amie en l&apos;ouvrant (le lien expire au bout de 24&nbsp;h).
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input className="input flex-1" readOnly value={inviteUrl} />
                  <button className="btn btn-secondary" onClick={() => void copyInviteUrl()} disabled={!inviteUrl || pending !== null}>
                    {pending === 'copy' ? 'Copie…' : 'Copier'}
                  </button>
                </div>
              </div>
            )}
          </SurfaceCard>

          {requests.length > 0 ? (
            <SurfaceCard tone="muted" className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-[-0.03em]">Demandes reçues</h2>
                <p className="text-sm leading-7 text-muted-foreground">Ces personnes souhaitent t&apos;ajouter en ami.</p>
              </div>
              <ul className="space-y-3">
                {requests.map((request) => {
                  const isAccepting = pending === `accept:${request.id}`
                  const isDeclining = pending === `decline:${request.id}`
                  return (
                    <li
                      key={request.id}
                      className="flex flex-col gap-3 rounded-[1.4rem] border border-[color:var(--color-border)] bg-white/72 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(15,93,94,0.12)] text-sm font-semibold text-[color:var(--color-accent)]">
                          {initialsFromEmail(request.email)}
                        </div>
                        <div className="text-sm font-semibold tracking-[-0.02em]">{request.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="btn btn-primary px-3 py-1.5 text-xs"
                          onClick={() => void respondToRequest(request.id, 'accept')}
                          disabled={pending !== null}
                        >
                          {isAccepting ? 'Ajout…' : 'Accepter'}
                        </button>
                        <button
                          className="btn btn-ghost px-3 py-1.5 text-xs"
                          onClick={() => void respondToRequest(request.id, 'decline')}
                          disabled={pending !== null}
                        >
                          {isDeclining ? 'Refus…' : 'Refuser'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </SurfaceCard>
          ) : null}
        </div>

        <SurfaceCard className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Mes amis</h2>
              <p className="text-sm leading-7 text-muted-foreground">
                Ouvre la liste commune quand tu veux comparer rapidement vos prochaines idées de sortie.
              </p>
            </div>
            <span className="chip">{friends.length} profil{friends.length > 1 ? 's' : ''}</span>
          </div>

          {friends.length === 0 ? (
            <div className="empty-state rounded-[1.5rem] border border-dashed border-[color:var(--color-border)] bg-white/45">
              <strong>Aucun ami pour le moment.</strong>
              <p className="text-sm leading-7 text-muted-foreground">Commence par partager ton lien ou par inviter un email.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {friends.map((friend) => {
                const isExpanded = selectedFriendId === friend.id
                const isLoadingCommon = pending === 'common' && isExpanded
                const isRemoving = pending === `remove:${friend.id}`

                return (
                  <li
                    key={friend.id}
                    className="rounded-[1.6rem] border border-[color:var(--color-border)] bg-white/72 p-4 shadow-[0_8px_24px_rgba(54,39,24,0.06)]"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(15,93,94,0.12)] text-sm font-semibold text-[color:var(--color-accent)]">
                          {initialsFromEmail(friend.email)}
                        </div>
                        <div>
                          <div className="text-base font-semibold tracking-[-0.02em]">{friend.email}</div>
                          <div className="text-sm text-muted-foreground">Découvre vos œuvres communes sans quitter cette ligne.</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          className={`btn ${isExpanded ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => void loadCommon(friend.id)}
                          disabled={pending !== null && !isLoadingCommon}
                        >
                          {isLoadingCommon ? 'Chargement…' : isExpanded ? 'Masquer les œuvres en commun' : 'Œuvres en commun'}
                        </button>
                        <button
                          className="btn btn-ghost px-3 py-1.5 text-xs"
                          onClick={() => void removeFriendById(friend)}
                          disabled={pending !== null}
                          aria-label={`Retirer ${friend.email}`}
                        >
                          {isRemoving ? 'Retrait…' : 'Retirer'}
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="mt-5 space-y-4 border-t border-[color:var(--color-border)] pt-5">
                        {isLoadingCommon ? <p className="text-sm text-muted-foreground">Chargement…</p> : null}

                        {!isLoadingCommon && commons.length === 0 ? (
                          <div className="empty-state rounded-[1.35rem] border border-dashed border-[color:var(--color-border)] bg-[rgba(255,255,255,0.65)]">
                            <strong>Aucune œuvre commune pour le moment.</strong>
                          </div>
                        ) : null}

                        {commons.length > 0 ? (
                          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {commons.map((work) => (
                              <li key={work?.id ?? `${friend.id}-${work?.sourceUrl ?? work?.title ?? 'work'}`}>
                                <WorkSummaryCard work={work} fallbackTitle="Œuvre commune" />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </SurfaceCard>
      </div>
    </div>
  )
}

function initialsFromEmail(email: string) {
  const local = email.split('@')[0] ?? email
  return local.slice(0, 2).toUpperCase()
}
