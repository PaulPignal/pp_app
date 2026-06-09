'use client'

import { useCallback, useState } from 'react'
import { cn } from '@/shared/lib/cn'

type Props = {
  /** Libellé affiché, ex. « Théâtre Montparnasse · Paris 14e ». */
  label: string
  /** Site officiel du lieu (la « source »). Si absent, le libellé reste en texte simple. */
  website: string | null
  /** Classe appliquée au texte/lien (reprend le style de la ligne lieu de chaque carte). */
  textClassName?: string
}

// Nom du lieu transformé en lien vers le site officiel (la source) + bouton copier
// discret. Remplace le lien « Voir sur Offi.fr » quand une source est disponible.
export default function VenueSource({ label, website, textClassName }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!website) return
      try {
        await navigator.clipboard.writeText(website)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      } catch {
        /* clipboard indisponible : on ignore silencieusement */
      }
    },
    [website],
  )

  if (!website) {
    return <span className={textClassName}>{label}</span>
  }

  return (
    // stopPropagation sur le pointeur : ne pas déclencher le swipe de la carte Découverte.
    <span className="inline-flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
      <a
        href={website}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          textClassName,
          'underline-offset-4 transition hover:text-[color:var(--color-accent)] hover:underline',
        )}
        title="Site officiel"
      >
        {label} <span aria-hidden>↗</span>
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Lien copié' : 'Copier le lien du site officiel'}
        title={copied ? 'Copié !' : 'Copier le lien'}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-muted)] transition hover:bg-[rgba(54,39,24,0.08)] hover:text-[color:var(--color-accent)]"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </span>
  )
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
