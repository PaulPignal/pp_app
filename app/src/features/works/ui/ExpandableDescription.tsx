'use client'

import { useState } from 'react'

// Seuil ~3 lignes : en dessous, pas besoin de "Voir plus".
const EXPAND_THRESHOLD = 160

export default function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = text.length > EXPAND_THRESHOLD

  return (
    <div className="space-y-1">
      <p
        className={`text-[0.95rem] leading-7 text-[color:var(--color-text-muted)] ${
          expanded || !canExpand ? '' : 'line-clamp-3'
        }`}
      >
        {text}
      </p>
      {canExpand ? (
        <button
          type="button"
          // stopPropagation : sinon la carte Découverte capture le pointeur (swipe)
          // et « avale » le clic → le bouton ne basculait plus.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setExpanded((value) => !value)}
          className="text-sm font-semibold text-[color:var(--color-accent)] underline-offset-4 hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? 'Voir moins' : 'Voir plus'}
        </button>
      ) : null}
    </div>
  )
}
