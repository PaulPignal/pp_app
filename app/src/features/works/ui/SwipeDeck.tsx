'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkCardDto } from '@/features/works/dto'
import CardWork from '@/features/works/ui/CardWork'
import SurfaceCard from '@/shared/ui/SurfaceCard'

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
      setDragStartTs(performance.now())
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
    },
    [pending],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragging.current || pending) return
      setDragX((value) => value + event.movementX)
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
      className="mx-auto flex w-full max-w-5xl flex-col gap-4 select-none"
    >
      <div className="page-meta">
        <span className="chip">Carte {Math.min(index + 1, visibleTotal)} / {visibleTotal}</span>
      </div>

      <div className="relative flex min-h-[38rem] items-center justify-center pb-2">
        {nextItems.map((item, previewIndex) => (
          <div
            key={item.id}
            aria-hidden
            className="pointer-events-none absolute inset-x-[4%] top-6 bottom-16 rounded-[2rem] border border-[color:var(--color-border)] bg-white/55 shadow-[0_22px_48px_rgba(54,39,24,0.10)]"
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
          className="relative z-10 h-full w-full max-w-xl cursor-grab touch-none rounded-[2rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface-strong)] p-2 shadow-[var(--shadow-lg)] will-change-transform"
        >
          <CardWork work={current} />
          <div className="pointer-events-none absolute inset-x-6 top-6 flex items-start justify-between">
            <span
              aria-hidden
              className="rounded-full border border-[rgba(35,100,75,0.35)] bg-[rgba(232,244,237,0.9)] px-4 py-2 text-sm font-semibold text-[color:var(--color-success)] opacity-0 shadow-[0_14px_30px_rgba(35,100,75,0.16)]"
              style={{ opacity: Math.max(0, Math.min(1, dragX / 120)) }}
            >
              Aimer
            </span>
            <span
              aria-hidden
              className="rounded-full border border-[rgba(160,74,65,0.3)] bg-[rgba(249,236,233,0.92)] px-4 py-2 text-sm font-semibold text-[color:var(--color-danger)] opacity-0 shadow-[0_14px_30px_rgba(160,74,65,0.14)]"
              style={{ opacity: Math.max(0, Math.min(1, -dragX / 120)) }}
            >
              Passer
            </span>
          </div>
        </div>
      </div>

      <SurfaceCard className="mx-auto w-full max-w-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[-0.02em] text-[color:var(--color-text)]">Choisis ton prochain mouvement</p>
            <p className="text-sm leading-6 text-muted-foreground">Aimer ou passer — tu peux annuler ton dernier geste.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void undo()}
              className="btn btn-secondary min-w-[6rem]"
              disabled={pending || history.length === 0}
              aria-label="Annuler le dernier swipe"
              title="Annuler le dernier swipe (Cmd/Ctrl+Z)"
            >
              ↶ Annuler
            </button>
            <button
              type="button"
              onClick={() => void advance(false)}
              className="btn btn-secondary min-w-[7rem]"
              disabled={pending}
              aria-label="Passer"
            >
              Passer
            </button>
            <button
              type="button"
              onClick={() => void advance(true)}
              className="btn btn-primary min-w-[7rem]"
              disabled={pending}
              aria-label="Aimer"
            >
              {pending ? 'Envoi…' : 'Aimer'}
            </button>
          </div>
        </div>
      </SurfaceCard>

      {error ? <p role="status" className="text-center text-sm font-medium text-[color:var(--color-danger)]">{error}</p> : null}
    </section>
  )
}
