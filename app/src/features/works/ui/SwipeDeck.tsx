'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkCardDto } from '@/features/works/dto'
import CardWork from '@/features/works/ui/CardWork'

type Props = {
  items: WorkCardDto[]
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

export default function SwipeDeck({ items }: Props) {
  const [index, setIndex] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [dragStartTs, setDragStartTs] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dragging = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const current = items[index]
  const hasMore = index < items.length

  const rotation = useMemo(() => dragX * 0.05, [dragX])
  const transform = useMemo(() => transformCss(dragX, rotation), [dragX, rotation])

  const react = useCallback(async (workId: string, status: 'LIKE' | 'DISLIKE') => {
    setError(null)
    try {
      const response = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workId, status }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        console.error('reaction failed', response.status, payload)
        setError("Impossible d'enregistrer l'action")
      }
    } catch (requestError) {
      console.error(requestError)
      setError("Impossible d'envoyer l'action")
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

    return (animation?.finished ?? Promise.resolve()).then(() => undefined).catch(() => {})
  }, [dragX])

  const advance = useCallback(
    async (didLike: boolean) => {
      if (!current || pending) return
      setPending(true)
      const currentId = current.id

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

        return (animation?.finished ?? Promise.resolve()).then(() => undefined).catch(() => {})
      }

      try {
        if (didLike) {
          await animateOut(800, 20)
          void react(currentId, 'LIKE')
        } else {
          await animateOut(-800, -20)
          void react(currentId, 'DISLIKE')
        }

        setIndex((value) => value + 1)
        setDragX(0)
        setDragStartTs(null)
      } finally {
        setPending(false)
      }
    },
    [current, dragX, pending, react],
  )

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!current || pending) return
      if (event.key === 'ArrowRight') void advance(true)
      if (event.key === 'ArrowLeft') void advance(false)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, current, pending])

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
        aria-label={current.title}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ transform, pointerEvents: pending ? 'none' : 'auto' }}
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
          aria-label="Passer"
        >
          Pass
        </button>
        <button
          type="button"
          onClick={() => void advance(true)}
          className="rounded-2xl border px-4 py-2"
          disabled={pending}
          aria-label="Aimer"
        >
          {pending ? '...' : 'Like'}
        </button>
      </div>

      {error ? (
        <p role="status" className="absolute bottom-[-1.5rem] text-center text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  )
}
