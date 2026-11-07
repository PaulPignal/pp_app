import Link from 'next/link'
import EmptyState from '@/shared/ui/EmptyState'

export default function NotFound() {
  return (
    <EmptyState
      headingLevel="h1"
      title="Cette page n’existe pas"
      className="mx-auto max-w-xl"
      action={
        <Link href="/discover" className="btn btn-primary">
          Retour à la découverte
        </Link>
      }
    >
      Le lien est peut-être périmé, ou la page a été déplacée.
    </EmptyState>
  )
}
