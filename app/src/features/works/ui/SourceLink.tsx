'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type Props = {
  /** Texte cliquable (titre de la pièce, nom du lieu…). */
  label: ReactNode
  /** URL de destination (la « source »). Si absente, le label reste en texte simple. */
  href: string | null
  /** Classe appliquée au texte/lien (reprend le style de l'élément hôte). */
  textClassName?: string
  /** Afficher le bouton « copier le lien » (par défaut oui). */
  copy?: boolean
}

// Transforme un texte de fiche en lien vers la source (site officiel / page dédiée),
// avec un bouton copier discret. Utilisé sur le titre (lien dédié de la fiche) et
// sur le nom du lieu (site du lieu).
export default function SourceLink({ label, href, textClassName, copy = true }: Props) {
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!href) return
      try {
        await navigator.clipboard.writeText(href)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      } catch {
        /* clipboard indisponible : on ignore silencieusement */
      }
    },
    [href],
  )

  if (!href) {
    return <span className={textClassName}>{label}</span>
  }

  return (
    // stopPropagation sur le pointeur : ne pas déclencher le swipe de la carte Découverte.
    <span className="inline-flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(textClassName, 'underline-offset-4 transition hover:text-[color:var(--color-accent)] hover:underline')}
        title="Lien officiel"
      >
        {label} <span aria-hidden>↗</span>
      </a>
      {copy ? (
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? 'Lien copié' : 'Copier le lien'}
          title={copied ? 'Copié !' : 'Copier le lien'}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--color-text-muted)] transition hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--color-accent)]"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      ) : null}
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
