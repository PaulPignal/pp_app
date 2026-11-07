'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { IconArrowUpRight, IconCheck, IconCopy } from '@/shared/ui/icons'

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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const onCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!href) return
      try {
        await navigator.clipboard.writeText(href)
        setCopied(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1600)
      } catch {
        /* presse-papier indisponible : rien à signaler */
      }
    },
    [href],
  )

  if (!href) {
    return <span className={textClassName}>{label}</span>
  }

  return (
    // stopPropagation sur le pointeur : ne pas déclencher le swipe de la carte Découverte.
    <span className="inline-flex max-w-full items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(textClassName, 'inline-flex items-baseline gap-0.5 underline-offset-4 hover:underline')}
        title="Ouvrir le site officiel (nouvel onglet)"
      >
        <span>{label}</span>
        <IconArrowUpRight size={12} className="shrink-0 self-center opacity-80" />
      </a>
      {copy ? (
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? 'Lien copié' : 'Copier le lien'}
          title={copied ? 'Lien copié' : 'Copier le lien'}
          className="btn-icon btn-icon-sm shrink-0 text-current opacity-80 hover:opacity-100"
        >
          {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
        </button>
      ) : null}
    </span>
  )
}
