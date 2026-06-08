import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="page-shell">
      <div className="mx-auto max-w-2xl">
        <div className="surface-card space-y-4">
          <span className="chip">Page introuvable</span>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-[-0.03em]">404 — cette page n’existe pas</h1>
            <p className="text-sm leading-7 text-[color:var(--color-text-muted)]">
              Le lien est peut-être périmé ou la page a été déplacée.
            </p>
          </div>
          <Link href="/discover" className="btn btn-primary">
            Retour à Découverte
          </Link>
        </div>
      </div>
    </div>
  )
}
