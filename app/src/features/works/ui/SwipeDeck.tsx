'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { WorkCardDto } from '@/features/works/dto'
import CardWork from '@/features/works/ui/CardWork'
import EmptyState from '@/shared/ui/EmptyState'
import { IconHeart, IconUndo, IconX } from '@/shared/ui/icons'
import { fetchJson } from '@/shared/lib/fetch-json'
import { SIGN_IN_PATH } from '@/shared/lib/routes'

// Like mémorisé pendant le swipe anonyme : rejoué après création de compte.
const PENDING_LIKE_KEY = 'offi:pendingLike'

type Props = {
  items: WorkCardDto[]
  /** Session connue côté serveur : pas d'attente de /api/auth/session avant le premier like. */
  authed: boolean
  totalCount?: number
}

const SWIPE_VELOCITY_PX_MS = 0.5
const SWIPE_THRESHOLD_PX = 80

function transformCss(x: number, rotDeg: number) {
  return `translateX(${x}px) rotate(${rotDeg}deg)`
}

function safeAnimate(el: Element | null) {
  if (!el) return null
  const element = el as Element & { animate?: typeof Element.prototype.animate }
  if (typeof element.animate === 'function') {
    return element.animate.bind(el)
  }
  return null
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

// Une animation WAAPI ne progresse pas tant que l'onglet est masqué : `finished`
// peut alors ne jamais se résoudre. On borne l'attente pour ne JAMAIS bloquer le
// swipe (en onglet visible, `finished` se résout bien avant le timeout).
function settle(animation: Animation | null | undefined, maxWaitMs: number): Promise<void> {
  const finished = (animation?.finished ?? Promise.resolve()).then(() => undefined).catch(() => undefined)
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs))
  return Promise.race([finished, timeout])
}

// Les raccourcis du deck ne doivent pas voler les flèches d'un champ de saisie ni d'une boîte de dialogue.
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
}

export default function SwipeDeck({ items, totalCount, authed }: Props) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ workId: string; status: 'LIKE' | 'DISLIKE' }[]>([])
  const [showSignup, setShowSignup] = useState(false)

  const dragging = useRef(false)
  const startX = useRef(0)
  // Début du geste : sert seulement au calcul de vitesse, aucun rendu à déclencher.
  const dragStartTs = useRef<number | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const likeButtonRef = useRef<HTMLButtonElement>(null)
  const signupFirstRef = useRef<HTMLAnchorElement>(null)
  const current = items[index]
  const next = items[index + 1]
  const hasMore = index < items.length
  const visibleTotal = totalCount ?? items.length

  const transform = transformCss(dragX, dragX * 0.05)

  // Écriture serveur : true si enregistrée ; l'appelant gère le retour arrière sinon.
  const react = useCallback(async (workId: string, status: 'LIKE' | 'DISLIKE'): Promise<boolean> => {
    try {
      await fetchJson('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workId, status }),
      })
      return true
    } catch (requestError) {
      console.error('reaction failed', requestError)
      return false
    }
  }, [])

  const clearReaction = useCallback(async (workId: string): Promise<boolean> => {
    try {
      await fetchJson(`/api/reactions?workId=${encodeURIComponent(workId)}`, { method: 'DELETE' })
      return true
    } catch (requestError) {
      console.error('undo failed', requestError)
      return false
    }
  }, [])

  const animateBackOnce = useCallback((): Promise<void> => {
    const element = cardRef.current
    if (!element) return Promise.resolve()

    const animate = safeAnimate(element)
    if (!animate || prefersReducedMotion()) {
      element.style.transform = transformCss(0, 0)
      element.style.opacity = ''
      return Promise.resolve()
    }

    const animation = animate([{ transform: transformCss(dragX, 0) }, { transform: transformCss(0, 0) }], {
      duration: 140,
      easing: 'ease-out',
    })

    return settle(animation, 200)
  }, [dragX])

  const advance = useCallback(
    async (didLike: boolean) => {
      if (!current || pending) return
      // Anonyme + like : on mémorise le like et on propose la création de compte
      // (sans avancer ni appeler le serveur). Les dislikes anonymes ne font qu'avancer.
      if (!authed && didLike) {
        try {
          localStorage.setItem(PENDING_LIKE_KEY, current.id)
        } catch {
          /* stockage indisponible */
        }
        setShowSignup(true)
        return
      }
      setPending(true)
      setError(null)
      const currentId = current.id
      const fromIndex = index

      const animateOut = (toX: number, rot: number): Promise<void> => {
        const element = cardRef.current
        if (!element) return Promise.resolve()

        const animate = safeAnimate(element)
        if (!animate || prefersReducedMotion()) {
          return Promise.resolve()
        }

        const animation = animate(
          [
            { transform: transformCss(dragX, rot / 2), opacity: 1 },
            { transform: transformCss(toX, rot), opacity: 0 },
          ],
          { duration: 180, easing: 'ease-out' },
        )

        return settle(animation, 250)
      }

      try {
        await animateOut(didLike ? 800 : -800, didLike ? 20 : -20)

        // Avance optimiste pour garder un rythme fluide…
        setIndex((value) => value + 1)
        setDragX(0)
        dragStartTs.current = null

        // …puis confirmation serveur (utilisateur connecté uniquement). Un dislike
        // anonyme ne fait qu'avancer (rien à persister). Rollback si l'écriture échoue.
        if (authed) {
          const ok = await react(currentId, didLike ? 'LIKE' : 'DISLIKE')
          if (!ok) {
            setIndex(fromIndex)
            setError('Votre choix n’a pas été enregistré. Réessayez.')
          } else {
            setHistory((value) => [...value, { workId: currentId, status: didLike ? 'LIKE' : 'DISLIKE' }])
          }
        }
      } finally {
        setPending(false)
      }
    },
    [authed, current, dragX, index, pending, react],
  )

  const undo = useCallback(async () => {
    if (pending || history.length === 0) return
    setPending(true)
    setError(null)
    const last = history[history.length - 1]
    const restoreIndex = Math.max(0, index - 1)

    // Optimiste : on revient tout de suite à la carte précédente (toujours en mémoire).
    setHistory((value) => value.slice(0, -1))
    setIndex(restoreIndex)
    setDragX(0)
    dragStartTs.current = null

    try {
      const ok = await clearReaction(last.workId)
      if (!ok) {
        // Rollback explicite : on remet l'historique et l'index.
        setHistory((value) => [...value, last])
        setIndex(index)
        setError('Annulation impossible. Réessayez.')
      }
    } finally {
      setPending(false)
    }
  }, [clearReaction, history, index, pending])

  // Après création de compte / connexion : on rejoue le like mémorisé pendant le
  // swipe anonyme (une seule fois), puis on nettoie.
  useEffect(() => {
    if (!authed) return
    let pendingId: string | null = null
    try {
      pendingId = localStorage.getItem(PENDING_LIKE_KEY)
      if (pendingId) localStorage.removeItem(PENDING_LIKE_KEY)
    } catch {
      /* stockage indisponible */
    }
    if (pendingId) void react(pendingId, 'LIKE')
  }, [authed, react])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (pending || showSignup || isTypingTarget(event.target)) return
      if ((event.metaKey || event.ctrlKey) && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault()
        void undo()
        return
      }
      if (!current) return
      if (event.key === 'ArrowRight') void advance(true)
      if (event.key === 'ArrowLeft') void advance(false)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, undo, current, pending, showSignup])

  // Boîte de dialogue d'inscription : focus initial, fermeture par Échap, retour du focus.
  const closeSignup = useCallback(() => {
    setShowSignup(false)
    likeButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!showSignup) return
    signupFirstRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeSignup()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showSignup, closeSignup])

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (pending) return
      dragging.current = true
      startX.current = event.clientX
      dragStartTs.current = performance.now()
      // Capture sur la carte (et non l'enfant touché) → tous les déplacements lui
      // sont routés, le geste ne « fuit » pas vers le scroll/retour navigateur.
      cardRef.current?.setPointerCapture?.(event.pointerId)
    },
    [pending],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragging.current || pending) return
      // Delta absolu depuis le point de départ : `movementX` est peu fiable
      // (souvent 0) sur tactile mobile → le drag ne suivait pas le doigt.
      setDragX(event.clientX - startX.current)
    },
    [pending],
  )

  const onPointerUp = useCallback(() => {
    if (!dragging.current || pending) return
    dragging.current = false
    const duration = dragStartTs.current ? performance.now() - dragStartTs.current : 1
    const velocity = dragX / duration
    const goRight = dragX > SWIPE_THRESHOLD_PX || velocity > SWIPE_VELOCITY_PX_MS
    const goLeft = dragX < -SWIPE_THRESHOLD_PX || velocity < -SWIPE_VELOCITY_PX_MS

    if (goRight) {
      void advance(true)
    } else if (goLeft) {
      void advance(false)
    } else {
      void animateBackOnce().then(() => {
        setDragX(0)
        dragStartTs.current = null
      })
    }
  }, [advance, animateBackOnce, dragX, pending])

  if (!hasMore) {
    return (
      <EmptyState
        title="Vous avez tout vu pour cette section"
        className="mx-auto max-w-xl"
        action={
          <>
            {history.length > 0 ? (
              <button type="button" onClick={() => void undo()} className="btn btn-secondary" disabled={pending}>
                <IconUndo size={16} /> Annuler le dernier swipe
              </button>
            ) : null}
            <button type="button" onClick={() => router.refresh()} className="btn btn-primary">
              Charger d’autres propositions
            </button>
          </>
        }
      >
        Changez de section pour continuer, ou revenez plus tard : le programme est mis à jour chaque semaine.
      </EmptyState>
    )
  }

  const likeOpacity = Math.max(0, Math.min(1, dragX / 120))
  const passOpacity = Math.max(0, Math.min(1, -dragX / 120))

  return (
    <section aria-label="Découvertes à balayer" className="mx-auto flex w-full max-w-xl flex-col gap-4 select-none">
      {/* Marge basse sur mobile : la fin de la carte peut défiler au-dessus de la barre d'actions. */}
      <div className="relative pb-20 lg:pb-0">
        {/* Carte suivante, déjà rendue sous la carte courante (invisible) : son affiche
            se charge pendant la lecture. Inerte pour le clavier et les lecteurs d'écran. */}
        {next ? (
          <div aria-hidden inert className="absolute inset-0 overflow-hidden opacity-0">
            <CardWork work={next} priority={false} />
          </div>
        ) : null}
        <div
          ref={cardRef}
          role="group"
          aria-roledescription="carte à balayer"
          aria-label={current.title}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ transform, pointerEvents: pending ? 'none' : 'auto' }}
          className="relative z-10 w-full cursor-grab touch-none overflow-hidden rounded-xl border border-line bg-surface will-change-transform active:cursor-grabbing"
        >
          <CardWork work={current} counter={`${Math.min(index + 1, visibleTotal)} / ${visibleTotal}`} />
          <div className="pointer-events-none absolute inset-x-5 top-5 flex items-start justify-between">
            <span
              aria-hidden
              className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-strong text-on-accent"
              style={{ opacity: likeOpacity }}
            >
              <IconHeart filled size={26} />
            </span>
            <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-page" style={{ opacity: passOpacity }}>
              <IconX size={26} />
            </span>
          </div>
        </div>
      </div>

      {/* Barre d'actions : sous la carte sur grand écran ; collée au-dessus de la barre
          de navigation sur mobile, pour rester sous le pouce sans défilement. Le voile
          dégradé derrière les boutons garde le texte de la carte lisible. */}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex items-center justify-center gap-4 bg-gradient-to-t from-page via-page/85 to-transparent px-4 pb-3 pt-8 lg:static lg:mx-auto lg:w-fit lg:bg-none lg:p-0">
        <button
          type="button"
          onClick={() => void undo()}
          className="btn-icon border border-line-strong bg-surface shadow-menu lg:shadow-none"
          disabled={pending || history.length === 0}
          aria-label="Annuler le dernier swipe"
          title="Annuler le dernier swipe (Cmd/Ctrl+Z)"
        >
          <IconUndo size={20} />
        </button>
        <button
          type="button"
          onClick={() => void advance(false)}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-line-strong bg-surface text-ink shadow-menu transition-transform duration-150 hover:bg-fill active:scale-95 disabled:opacity-50 lg:shadow-none"
          disabled={pending}
          aria-label="Passer"
          title="Passer (flèche gauche)"
        >
          <IconX size={26} />
        </button>
        <button
          ref={likeButtonRef}
          type="button"
          onClick={() => void advance(true)}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-strong text-on-accent shadow-menu transition-transform duration-150 hover:bg-accent-strong-hover active:scale-95 disabled:opacity-50 lg:shadow-none"
          disabled={pending}
          aria-label="Aimer"
          title="Aimer (flèche droite)"
        >
          <IconHeart filled size={28} />
        </button>
      </div>
      <p className="hidden text-center text-xs text-ink-muted lg:block" aria-hidden>
        Flèche gauche : passer · flèche droite : aimer · Cmd/Ctrl+Z : annuler
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mx-auto w-fit">
          {error}
        </p>
      ) : null}

      {/* Onboarding : au 1er like en anonyme, on propose la création de compte. */}
      {showSignup ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center sm:p-6"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeSignup()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="signup-dialog-title"
            className="w-full max-w-sm rounded-t-xl bg-raised p-6 shadow-float sm:rounded-xl"
          >
            <h2 id="signup-dialog-title" className="display text-2xl text-ink">
              Gardez ce coup de cœur
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Un compte permet d’enregistrer vos likes, de les retrouver sur la page Mes likes et de voir ce que vos amis aiment.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Link ref={signupFirstRef} href="/signup" className="btn btn-primary w-full">
                Créer un compte
              </Link>
              <Link href={SIGN_IN_PATH} className="btn btn-secondary w-full">
                J’ai déjà un compte
              </Link>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem(PENDING_LIKE_KEY)
                  } catch {
                    /* stockage indisponible */
                  }
                  closeSignup()
                  setIndex((value) => value + 1)
                  setDragX(0)
                }}
                className="btn btn-ghost w-full"
              >
                Plus tard
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
