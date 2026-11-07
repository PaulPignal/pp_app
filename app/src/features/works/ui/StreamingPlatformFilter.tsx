'use client'

import { useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'

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

  return (
    <div role="group" aria-label="Filtrer par plateforme" className="flex flex-wrap items-center gap-2">
      <span className="eyebrow mr-1">Plateformes</span>
      <button type="button" aria-pressed={set.size === 0} onClick={() => go([])} className="pill">
        Toutes
      </button>
      {available.map((platform) => {
        const active = set.has(platform)
        const next = active ? optimistic.filter((p) => p !== platform) : [...optimistic, platform]
        return (
          <button key={platform} type="button" aria-pressed={active} onClick={() => go(next)} className="pill">
            {platform}
          </button>
        )
      })}
    </div>
  )
}
