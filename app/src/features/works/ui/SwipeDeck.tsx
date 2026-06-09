'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkCardDto } from '@/features/works/dto'
import CardWork from '@/features/works/ui/CardWork'
import SurfaceCard from '@/shared/ui/SurfaceCard'

// Icônes d'action (style épuré, façon apps de swipe). aria-hidden : le libellé
// accessible est porté par le bouton.
function IconHeart({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  )
}

function IconX({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function IconRewind({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}

type Props = {
  items: WorkCardDto[]
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

// Une animation WAAPI ne progresse pas tant que l'onglet est masqué : `finished`
// peut alors ne jamais se résoudre. On borne l'attente pour ne JAMAIS bloquer le
// swipe (en onglet visible, `finished` se résout bien avant le timeout).
function settle(animation: Animation | null | undefined, maxWaitMs: number): Promise<void> {
  const finished = (animation?.finished ?? Promise.resolve()).then(() => undefined).catch(() => undefined)
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs))
  return Promise.race([finished, timeout])
}

export default function SwipeDeck({ items, totalCount }: Props) {
  const [index, setIndex] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [dragStartTs, setDragStartTs] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<{ workId: string; status: 'LIKE' | 'DISLIKE' }[]>([])

  const dragging = useRef(false)
  const startX = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const current = items[index]
  const hasMore = index < items.length
  const visibleTotal = totalCount ?? items.length
  const nextItems = items.slice(index + 1, index + 3)

  const rotation = useMemo(() => dragX * 0.05, [dragX])
  const transform = useMemo(() => transformCss(dragX, rotation), [dragX, rotation])

  const react = useCallback(async (workId: string, status: 'LIKE' | 'DISLIKE'): Promise<boolean> => {
    try {
      const response = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workId, status }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        console.error('reaction failed', response.status, payload)
        return false
      }
      return true
    } catch (requestError) {
      console.error(requestError)
      return false
    }
  }, [])

  const clearReaction = useCallback(async (workId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/reactions?workId=${encodeURIComponent(workId)}`, { method: 'DELETE' })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        console.error('undo failed', response.status, payload)
        return false
      }
      return true
    } catch (requestError) {
      console.error(requestError)
      return false
    }
  }, [])

  const animateBackOnce = useCallback((): Promise<void> => {
    const element = cardRef.current
    if (!element) return Promise.resolve()

    const animate = safeAnimate(element)
    if (!animate) {
      element.style.transform = transformCss(0, 0)
      element.style.opacity = ''
      return Promise.resolve()
    }

    const animation = animate(
      [{ transform: transformCss(dragX, 0) }, { transform: transformCss(0, 0) }],
      { duration: 140, easing: 'ease-out' },
    )

    return settle(animation, 200)
  }, [dragX])

  const advance = useCallback(
    async (didLike: boolean) => {
      if (!current || pending) return
      setPending(true)
      setError(null)
      const currentId = current.id
      const fromIndex = index

      const animateOut = (toX: number, rot: number): Promise<void> => {
        const element = cardRef.current
        if (!element) return Promise.resolve()

        const animate = safeAnimate(element)
        if (!animate) {
          element.style.transform = transformCss(toX, rot)
          element.style.opacity = '0'
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
        setDragStartTs(null)

        // …puis confirmation serveur. En cas d'échec : rollback explicite de la carte.
        const ok = await react(currentId, didLike ? 'LIKE' : 'DISLIKE')
        if (!ok) {
          setIndex(fromIndex)
          setError('Action non enregistrée. Réessaie.')
        } else {
          setHistory((value) => [...value, { workId: currentId, status: didLike ? 'LIKE' : 'DISLIKE' }])
        }
      } finally {
        setPending(false)
      }
    },
    [current, dragX, index, pending, react],
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
    setDragStartTs(null)

    try {
      const ok = await clearReaction(last.workId)
      if (!ok) {
        // Rollback explicite : on remet l'historique et l'index.
        setHistory((value) => [...value, last])
        setIndex(index)
        setError('Annulation impossible. Réessaie.')
      }
    } finally {
      setPending(false)
    }
  }, [clearReaction, history, index, pending])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (pending) return
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
  }, [advance, undo, current, pending])

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (pending) return
      dragging.current = true
      startX.current = event.clientX
      setDragStartTs(performance.now())
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
    const duration = dragStartTs ? performance.now() - dragStartTs : 1
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
        setDragStartTs(null)
      })
    }
  }, [advance, animateBackOnce, dragStartTs, dragX, pending])

  if (!hasMore) {
    return (
      <SurfaceCard className="mx-auto max-w-2xl">
        <div className="empty-state">
          <span className="chip">Pile terminée</span>
          <strong>Plus de découvertes pour le moment.</strong>
          <p className="max-w-md text-sm leading-7 text-muted-foreground">
            Reviens plus tard ou change de section pour relancer une nouvelle série de cartes.
          </p>
          {history.length > 0 ? (
            <button
              type="button"
              onClick={() => void undo()}
              className="btn btn-secondary mt-2"
              disabled={pending}
              aria-label="Annuler le dernier swipe"
            >
              ↶ Annuler le dernier swipe
            </button>
          ) : null}
        </div>
      </SurfaceCard>
    )
  }

  return (
    <section
      aria-label="Sélection de découvertes à balayer"
      className="mx-auto flex w-full max-w-5xl flex-col gap-3 select-none"
    >
      <div className="relative flex min-h-[30rem] items-center justify-center pb-2">
        {nextItems.map((item, previewIndex) => (
          <div
            key={item.id}
            aria-hidden
            className="pointer-events-none absolute inset-x-[4%] top-6 bottom-16 rounded-[var(--radius-2xl)] border border-[color:var(--color-border)] bg-white/70 shadow-[0_22px_48px_rgba(54,39,24,0.10)]"
            style={{
              transform: `translateY(${(previewIndex + 1) * 14}px) scale(${1 - (previewIndex + 1) * 0.03})`,
              opacity: 0.9 - previewIndex * 0.18,
            }}
          />
        ))}

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
          className="relative z-10 h-full w-full max-w-xl cursor-grab touch-none rounded-[var(--radius-2xl)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-strong)] p-2 shadow-[var(--shadow-lg)] will-change-transform"
        >
          <CardWork work={current} counter={`${Math.min(index + 1, visibleTotal)} / ${visibleTotal}`} />
          <div className="pointer-events-none absolute inset-x-6 top-6 flex items-start justify-between">
            <span
              aria-hidden
              className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[color:var(--color-success)] bg-[rgba(232,244,237,0.92)] text-[color:var(--color-success)] opacity-0 shadow-[0_14px_30px_rgba(0,0,0,0.45)]"
              style={{ opacity: Math.max(0, Math.min(1, dragX / 120)) }}
            >
              <IconHeart className="h-6 w-6" />
            </span>
            <span
              aria-hidden
              className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[color:var(--color-danger)] bg-[rgba(160,74,65,0.10)] text-[color:var(--color-danger)] opacity-0 shadow-[0_14px_30px_rgba(0,0,0,0.45)]"
              style={{ opacity: Math.max(0, Math.min(1, -dragX / 120)) }}
            >
              <IconX className="h-6 w-6" />
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-xl items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => void undo()}
          className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#e0a23b] bg-[color:var(--color-surface-strong)] text-[#cf8f24] shadow-[var(--shadow-lg)] transition hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
          disabled={pending || history.length === 0}
          aria-label="Annuler le dernier swipe"
          title="Annuler le dernier swipe (Cmd/Ctrl+Z)"
        >
          <IconRewind className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => void advance(false)}
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[color:var(--color-danger)] bg-[color:var(--color-surface-strong)] text-[color:var(--color-danger)] shadow-[var(--shadow-lg)] transition hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
          disabled={pending}
          aria-label="Passer"
          title="Passer"
        >
          <IconX className="h-7 w-7" />
        </button>
        <button
          type="button"
          onClick={() => void advance(true)}
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[color:var(--color-success)] bg-[color:var(--color-surface-strong)] text-[color:var(--color-success)] shadow-[var(--shadow-lg)] transition hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
          disabled={pending}
          aria-label="Aimer"
          title="Aimer"
        >
          <IconHeart className={pending ? 'h-6 w-6 animate-pulse' : 'h-6 w-6'} />
        </button>
      </div>

      {error ? <p role="status" className="text-center text-sm font-medium text-[color:var(--color-danger)]">{error}</p> : null}
    </section>
  )
}
