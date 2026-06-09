import Link from 'next/link'

type Props = {
  /** Plateformes disponibles dans le catalogue. */
  available: string[]
  /** Plateformes actuellement sélectionnées. */
  selected: string[]
}

function hrefFor(platforms: string[]) {
  const base = '/discover?section=streaming'
  return platforms.length ? `${base}&platforms=${encodeURIComponent(platforms.join(','))}` : base
}

// Filtre plateformes de l'onglet Streaming : chaque puce ajoute/retire sa plateforme
// du filtre (état porté par l'URL → re-rendu serveur du deck). « Toutes » réinitialise.
export default function StreamingPlatformFilter({ available, selected }: Props) {
  if (available.length === 0) return null
  const selectedSet = new Set(selected)

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par plateforme">
      <Link
        href={hrefFor([])}
        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
          selectedSet.size === 0
            ? 'bg-[color:var(--color-accent)] text-white'
            : 'bg-[rgba(255,255,255,0.07)] text-[color:var(--color-text)] hover:bg-[rgba(255,255,255,0.14)]'
        }`}
      >
        Toutes
      </Link>
      {available.map((platform) => {
        const active = selectedSet.has(platform)
        const next = active ? selected.filter((p) => p !== platform) : [...selected, platform]
        return (
          <Link
            key={platform}
            href={hrefFor(next)}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              active
                ? 'bg-[color:var(--color-accent)] text-white'
                : 'bg-[rgba(255,255,255,0.07)] text-[color:var(--color-text)] hover:bg-[rgba(255,255,255,0.14)]'
            }`}
          >
            {platform}
          </Link>
        )
      })}
    </div>
  )
}
