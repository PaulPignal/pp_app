"use client";
export default function DiscoverError({
  error,
  reset,
}: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="surface-card space-y-4">
        <span className="chip">Découverte interrompue</span>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">Impossible de charger le deck</h1>
          <p className="text-sm leading-7 text-[color:var(--color-text-muted)]">
            Le chargement des œuvres a échoué. Réessaie dans un instant.
          </p>
          {error?.digest ? (
            <p className="text-xs text-[color:var(--color-text-muted)]">Référence&nbsp;: {error.digest}</p>
          ) : null}
        </div>
      </div>
      <button
        onClick={() => reset()}
        className="btn btn-primary mt-4"
      >
        Réessayer
      </button>
    </div>
  )
}
