'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { FriendSummaryDto } from '@/features/friendships/dto'
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
  const [commons, setCommons] = useState<CommonPayload['works']>([])
  const [emailInput, setEmailInput] = useState('')
  const [tokenInput, setTokenInput] = useState(() => searchParams.get('token') ?? '')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState<'email' | 'token' | 'copy' | 'common' | null>(null)
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null)
  const [addMode, setAddMode] = useState<'email' | 'link' | 'token'>(() => (searchParams.get('token') ? 'token' : 'email'))

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
        description="Ajoute une personne par email, par lien ou avec un token, puis ouvre directement les oeuvres communes depuis sa ligne pour garder le contexte."
        meta={
          <>
            <span className="chip">{friends.length} ami{friends.length > 1 ? 's' : ''}</span>
            <span className="chip">{inviteToken ? 'Lien d’invitation prêt' : 'Lien indisponible'}</span>
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
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Choisis un seul mode d’invitation à la fois</h2>
              <p className="text-sm leading-7 text-muted-foreground">
                Le plus simple reste l&apos;email. Le lien et le token servent surtout pour un partage plus ponctuel.
              </p>
            </div>

            <SegmentedControl
              ariaLabel="Choisir un mode d'ajout"
              value={addMode}
              onChange={(value) => setAddMode(value as 'email' | 'link' | 'token')}
              fullWidth
              items={[
                { label: 'Par email', value: 'email' },
                { label: 'Par lien', value: 'link' },
                { label: 'Par token', value: 'token' },
              ]}
            />

            {addMode === 'email' ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="label">Ajouter par email</label>
                  <p className="field-hint">Le plus simple si tu connais l&apos;email exact de la personne.</p>
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
                    {pending === 'email' ? 'Ajout…' : 'Ajouter'}
                  </button>
                </div>
              </div>
            ) : null}

            {addMode === 'link' ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="label">Mon lien d&apos;invitation</label>
                  <p className="field-hint">
                    Pratique si tu ne veux pas partager ton email ou si l&apos;autre personne préfère ouvrir un lien.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input className="input flex-1" readOnly value={inviteUrl} />
                  <button className="btn btn-secondary" onClick={() => void copyInviteUrl()} disabled={!inviteUrl || pending !== null}>
                    {pending === 'copy' ? 'Copie…' : 'Copier'}
                  </button>
                </div>
              </div>
            ) : null}

            {addMode === 'token' ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="label">Ajouter avec un token</label>
                  <p className="field-hint">Colle le token reçu pour valider l&apos;invitation immédiatement.</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    className="input flex-1"
                    placeholder="token reçu"
                    value={tokenInput}
                    onChange={(event) => setTokenInput(event.target.value)}
                  />
                  <button className="btn btn-primary" onClick={() => void addFriendByToken()} disabled={!tokenInput || pending !== null}>
                    {pending === 'token' ? 'Ajout…' : 'Ajouter'}
                  </button>
                </div>
              </div>
            ) : null}
          </SurfaceCard>

          <SurfaceCard tone="muted" className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-[color:var(--color-accent)]">Conseil</p>
            <p className="text-sm leading-7 text-muted-foreground">
              Une fois l&apos;ami ajouté, ouvre ses oeuvres en commun directement depuis sa ligne. Cela garde la comparaison
              visible sans te faire descendre sur une autre section de page.
            </p>
          </SurfaceCard>
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
              <p className="text-sm leading-7 text-muted-foreground">Commence par partager ton lien ou par saisir un email.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {friends.map((friend) => {
                const isExpanded = selectedFriendId === friend.id
                const isLoadingCommon = pending === 'common' && isExpanded

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
                          <div className="text-sm text-muted-foreground">Découvre vos oeuvres communes sans quitter cette ligne.</div>
                        </div>
                      </div>

                      <button
                        className={`btn ${isExpanded ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => void loadCommon(friend.id)}
                        disabled={pending !== null && !isLoadingCommon}
                      >
                        {isLoadingCommon ? 'Chargement…' : isExpanded ? 'Masquer les oeuvres en commun' : 'Œuvres en commun'}
                      </button>
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
