'use client'

import EmptyState from '@/shared/ui/EmptyState'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      headingLevel="h1"
      title="Cette page n’a pas pu s’afficher"
      className="mx-auto max-w-xl"
      action={
        <button type="button" onClick={() => reset()} className="btn btn-primary">
          Réessayer
        </button>
      }
    >
      Réessayez ; si le problème persiste, revenez un peu plus tard.
      {error?.digest ? <span className="mt-2 block text-xs">Référence : {error.digest}</span> : null}
    </EmptyState>
  )
}
