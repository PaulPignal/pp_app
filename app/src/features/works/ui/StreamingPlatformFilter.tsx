'use client'

import { useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/shared/lib/cn'

type Props = {
  /** Plateformes disponibles dans le catalogue. */
  available: string[]
  /** Plateformes actuellement sélectionnées (depuis l'URL). */
  selected: string[]
}

function hrefFor(platforms: string[]) {
  const base = '/discover?section=streaming'
  return platforms.length ? `${base}&platforms=${encodeURIComponent(platforms.join(','))}` : base
}

// Filtre plateformes (onglet Streaming). État dans l'URL, mais la sélection est
// **optimiste** : la puce s'active immédiatement (useOptimistic) pendant que le deck
// se met à jour en arrière-plan → plus de latence perçue au clic.
export default function StreamingPlatformFilter({ available, selected }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useOptimistic(selected)

  if (available.length === 0) return null
  const set = new Set(optimistic)

  function go(next: string[]) {
    startTransition(() => {
      setOptimistic(next)
      router.replace(hrefFor(next), { scroll: false })
    })
  }

  const pill = (active: boolean) =>
    cn(
      'rounded-full px-3 py-1 text-xs font-medium transition',
      active
        ? 'bg-[color:var(--color-accent)] text-white'
        : 'bg-[color:var(--color-fill)] text-[color:var(--color-text)] hover:bg-[color:var(--color-fill-hover)]',
    )

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par plateforme">
      <button type="button" onClick={() => go([])} className={pill(set.size === 0)}>
        Toutes
      </button>
      {available.map((platform) => {
        const active = set.has(platform)
        const next = active ? optimistic.filter((p) => p !== platform) : [...optimistic, platform]
        return (
          <button key={platform} type="button" aria-pressed={active} onClick={() => go(next)} className={pill(active)}>
            {platform}
          </button>
        )
      })}
    </div>
  )
}
