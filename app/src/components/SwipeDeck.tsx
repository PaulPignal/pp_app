// src/components/SwipeDeck.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CardWork from './CardWork'
import type { Work } from '@/types/Work'

type Props = { items: Work[] }

const SWIPE_VELOCITY_PX_MS = 0.5
const SWIPE_THRESHOLD_PX = 80

function transformCss(x: number, rotDeg: number) {
  return `translateX(${x}px) rotate(${rotDeg}deg)`
}

export default function SwipeDeck({ items }: Props) {
  const [index, setIndex] = useState(0)
  const current = items[index]
  const [dragX, setDragX] = useState(0)
  const [dragStartTs, setDragStartTs] = useState<number | null>(null)
  const dragging = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const [pending, setPending] = useState(false) // 🔒 lock anti-double
  const [error, setError] = useState<string | null>(null)

  const hasMore = index < items.length
  const transform = useMemo(() => transformCss(dragX, dragX * 0.05), [dragX])

  // --- API like (optimiste + lock)
  const like = useCallback(async (workId: string) => {
    setError(null)
    try {
      const res = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        // eslint-disable-next-line no-console
        console.error('like failed', res.status, j)
        setError("Impossible d'enregistrer le like")
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e)
      setError("Impossible d'envoyer le like")
    }
  }, [])

  // Helper local pour l'animation de retour (utilisé par onPointerUp)
  const animateBackOnce = useCallback((): Promise<void> => {
    const el = cardRef.current
    if (!el) return Promise.resolve()

    const animateFn = (el as any).animate as undefined | ((k: any, o?: any) => any)
    if (typeof animateFn !== 'function') {
      el.style.transform = transformCss(0, 0)
      return Promise.resolve()
    }

    const anim = animateFn(
      [{ transform: transformCss(dragX, 0) }, { transform: transformCss(0, 0) }],
      { duration: 140, easing: 'ease-out' },
    )

    return (anim?.finished ?? Promise.resolve()).catch(() => {})
  }, [dragX])

  // --- avancer d'une carte (optimiste)
  const advance = useCallback(
    async (didLike: boolean) => {
      if (!current || pending) return
      setPending(true)
      const curId = current.id

      // animation de sortie (toujours renvoyer une Promise)
      const animateOut = (toX: number, rot: number): Promise<void> => {
        const el = cardRef.current
        if (!el) return Promise.resolve()

        const animateFn = (el as any).animate as undefined | ((k: any, o?: any) => any)
        if (typeof animateFn !== 'function') {
          // Fallback sans WAAPI
          el.style.transform = transformCss(toX, rot)
          el.style.opacity = '0'
          return Promise.resolve()
        }

        const anim = animateFn(
          [{ transform: transformCss(dragX, rot / 2) }, { transform: transformCss(toX, rot), opacity: 0 }],
          { duration: 180, easing: 'ease-out' },
        )

        return (anim?.finished ?? Promise.resolve()).catch(() => {})
      }

      try {
        if (didLike) {
          await animateOut(800, 20)
          // optimiste: on envoie après l’animation
          void like(curId)
        } else {
          await animateOut(-800, -20)
        }
        // passe à la carte suivante
        setIndex((i) => i + 1)
        setDragX(0)
        setDragStartTs(null)
      } finally {
        setPending(false)
      }
    },
    [current, dragX, like, pending],
  )

  // --- clavier
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || pending) return
      if (e.key === 'ArrowRight') void advance(true)
      if (e.key === 'ArrowLeft') void advance(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, current, pending])

  // --- pointeur
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (pending) return
      dragging.current = true
      setDragStartTs(performance.now())
      ;(e.target as Element)?.setPointerCapture?.(e.pointerId)
    },
    [pending],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || pending) return
      setDragX((x) => x + e.movementX)
    },
    [pending],
  )

  const onPointerUp = useCallback(() => {
    if (!dragging.current || pending) return
    dragging.current = false
    const dt = dragStartTs ? performance.now() - dragStartTs : 1
    const vx = dragX / dt
    const goRight = dragX > SWIPE_THRESHOLD_PX || vx > SWIPE_VELOCITY_PX_MS
    const goLeft = dragX < -SWIPE_THRESHOLD_PX || vx < -SWIPE_VELOCITY_PX_MS

    if (goRight) {
      void advance(true)
    } else if (goLeft) {
      void advance(false)
    } else {
      // Animation de retour safe (Promise), puis reset des états
      void animateBackOnce().then(() => {
        setDragX(0)
        setDragStartTs(null)
      })
    }
  }, [advance, dragStartTs, dragX, pending, animateBackOnce])

  if (!hasMore) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold">Plus de découvertes pour le moment ✨</p>
        <p className="text-sm text-muted-foreground">Reviens bientôt ou change tes filtres.</p>
      </div>
    )
  }

  return (
    <section
      aria-label="Sélection de découvertes à balayer"
      className="relative mx-auto mt-4 flex h-[70vh] max-w-md select-none items-center justify-center"
    >
      <div
        ref={cardRef}
        role="group"
        aria-roledescription="carte à balayer"
        aria-label={current?.title}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ transform, pointerEvents: pending ? 'none' : 'auto' }} // 🔒 bloque pendant envoi
        className="absolute inset-0 m-auto h-full w-full max-w-md cursor-grab touch-none rounded-2xl border bg-background p-2 shadow-xl will-change-transform"
      >
        <CardWork work={current} />
        <div className="pointer-events-none absolute inset-0 flex items-start justify-between p-4">
          <span
            aria-hidden
            className="rounded-xl border px-3 py-1 text-sm font-semibold opacity-0"
            style={{ opacity: Math.max(0, Math.min(1, dragX / 120)) }}
          >
            ❤️ Like
          </span>
          <span
            aria-hidden
            className="rounded-xl border px-3 py-1 text-sm font-semibold opacity-0"
            style={{ opacity: Math.max(0, Math.min(1, -dragX / 120)) }}
          >
            ⛔ Pass
          </span>
        </div>
      </div>

      <div className="absolute bottom-3 left-0 right-0 mx-auto flex w-full max-w-xs items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => void advance(false)}
          className="rounded-2xl border px-4 py-2"
          disabled={pending}
        >
          Pass
        </button>
        <button
          type="button"
          onClick={() => void advance(true)}
          className="rounded-2xl border px-4 py-2"
          disabled={pending}
        >
          {pending ? '...' : 'Like'}
        </button>
      </div>

      {error && (
        <p role="status" className="absolute bottom-[-1.5rem] text-center text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  )
}