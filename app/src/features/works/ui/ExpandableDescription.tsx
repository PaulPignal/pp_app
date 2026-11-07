'use client'

import { useState } from 'react'

// Seuil ~3 lignes : en dessous, pas besoin de « Voir plus ».
const EXPAND_THRESHOLD = 160

export default function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = text.length > EXPAND_THRESHOLD

  return (
    <div>
      <p className={`text-sm leading-6 text-ink-muted ${expanded || !canExpand ? '' : 'line-clamp-3'}`}>{text}</p>
      {canExpand ? (
        <button
          type="button"
          // stopPropagation : sinon la carte Découverte capture le pointeur (swipe)
          // et « avale » le clic → le bouton ne basculait plus.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setExpanded((value) => !value)}
          className="btn btn-ghost -ml-4 px-4 text-accent"
          aria-expanded={expanded}
        >
          {expanded ? 'Voir moins' : 'Voir plus'}
        </button>
      ) : null}
    </div>
  )
}
