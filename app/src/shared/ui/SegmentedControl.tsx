'use client'

import Link from 'next/link'
import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/shared/lib/cn'

type SegmentedItem = {
  label: string
  value: string
  href?: string
  count?: number
  disabled?: boolean
}

type SegmentedControlProps = {
  items: SegmentedItem[]
  value: string
  ariaLabel: string
  onChange?: (value: string) => void
  // Par défaut, bande défilable sur une ligne. `wrap` : retour à la ligne (peu d'items).
  wrap?: boolean
  className?: string
}

// Barre de pilules. Deux sémantiques selon l'usage :
// - items avec `href` : navigation (nav + aria-current), un lien par section ;
// - items avec `onChange` : choix unique (radiogroup + flèches, tabulation unique).
export default function SegmentedControl({ items, value, ariaLabel, onChange, wrap = false, className }: SegmentedControlProps) {
  const groupRef = useRef<HTMLDivElement>(null)
  const stripClass = cn('pill-strip', wrap && 'flex-wrap overflow-visible', className)
  const isNav = items.some((item) => item.href)

  const content = (item: SegmentedItem) => (
    <>
      <span>{item.label}</span>
      {typeof item.count === 'number' ? <span className="tabular-nums opacity-70">{item.count}</span> : null}
    </>
  )
  // Nom accessible « Libellé N » (le compteur est lu avec son libellé, séparé par un espace).
  const nameOf = (item: SegmentedItem) => (typeof item.count === 'number' ? `${item.label} ${item.count}` : undefined)

  if (isNav) {
    return (
      <nav aria-label={ariaLabel} className={stripClass}>
        {items.map((item) => {
          const active = item.value === value
          return (
            <Link key={item.value} href={item.href ?? '#'} className="pill" aria-current={active ? 'page' : undefined} aria-label={nameOf(item)}>
              {content(item)}
            </Link>
          )
        })}
      </nav>
    )
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = items.filter((item) => !item.disabled)
    const index = enabled.findIndex((item) => item.value === value)
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % enabled.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + enabled.length) % enabled.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = enabled.length - 1
    if (next === null) return
    event.preventDefault()
    const target = enabled[next]
    onChange?.(target.value)
    const button = groupRef.current?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(target.value)}"]`)
    button?.focus()
  }

  return (
    <div ref={groupRef} role="radiogroup" aria-label={ariaLabel} className={stripClass} onKeyDown={onKeyDown}>
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={nameOf(item)}
            data-value={item.value}
            tabIndex={active ? 0 : -1}
            className="pill"
            onClick={() => onChange?.(item.value)}
            disabled={item.disabled}
          >
            {content(item)}
          </button>
        )
      })}
    </div>
  )
}
