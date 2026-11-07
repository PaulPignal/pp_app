'use client'

import EmptyState from '@/shared/ui/EmptyState'

export default function DiscoverError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      headingLevel="h1"
      title="La sélection n’a pas pu être chargée"
      className="mx-auto max-w-xl"
      action={
        <button type="button" onClick={() => reset()} className="btn btn-primary">
          Réessayer
        </button>
      }
    >
      Un problème est survenu en préparant les cartes. Réessayez dans un instant.
      {error?.digest ? <span className="mt-2 block text-xs">Référence : {error.digest}</span> : null}
    </EmptyState>
  )
}
