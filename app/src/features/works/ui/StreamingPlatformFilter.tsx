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
    // Une seule rangée défilable sur mobile (comme les sections) : sur trois rangées, le filtre
    // repoussait la fiche sous la barre d'actions. Retour à la ligne à partir de 640 px.
    <div role="group" aria-label="Filtrer par plateforme" className="pill-strip items-center sm:flex-wrap">
      <span className="eyebrow mr-1 self-center">Plateformes</span>
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
