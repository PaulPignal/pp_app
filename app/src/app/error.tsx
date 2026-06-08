'use client'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="page-shell">
      <div className="mx-auto max-w-2xl">
        <div className="surface-card space-y-4">
          <span className="chip">Une erreur est survenue</span>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-[-0.03em]">Quelque chose s’est mal passé</h1>
            <p className="text-sm leading-7 text-[color:var(--color-text-muted)]">
              Désolé, cette page n’a pas pu s’afficher. Tu peux réessayer ; si le problème persiste, reviens un peu plus tard.
            </p>
            {error?.digest ? (
              <p className="text-xs text-[color:var(--color-text-muted)]">Référence&nbsp;: {error.digest}</p>
            ) : null}
          </div>
          <button onClick={() => reset()} className="btn btn-primary">
            Réessayer
          </button>
        </div>
      </div>
    </div>
  )
}
