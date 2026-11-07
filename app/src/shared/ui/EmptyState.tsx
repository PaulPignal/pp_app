import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type EmptyStateProps = {
  title: string
  children?: ReactNode
  action?: ReactNode
  // `card` : dans une carte (page). `inline` : à plat, dans une liste ou un panneau.
  variant?: 'card' | 'inline'
  className?: string
  // Niveau de titre selon la place dans la page (h1 sur une page d'erreur, h2 sinon).
  headingLevel?: 'h1' | 'h2' | 'p'
}

// État vide, erreur ou fin de liste : un titre éditorial, une phrase, une action.
// Un h1 signale une page entière (erreur, introuvable) : le bloc est alors centré verticalement.
export default function EmptyState({ title, children, action, variant = 'card', className, headingLevel = 'h2' }: EmptyStateProps) {
  const Heading = headingLevel
  const block = (
    <div
      className={cn(
        'flex flex-col items-center gap-3 text-center',
        variant === 'card' ? 'card px-6 py-10' : 'rounded-lg border border-dashed border-line px-6 py-8',
        className,
      )}
    >
      <Heading className="display text-xl text-ink">{title}</Heading>
      {children ? <p className="max-w-sm text-sm text-ink-muted">{children}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  )
  return headingLevel === 'h1' ? <div className="flex min-h-[60dvh] flex-col justify-center">{block}</div> : block
}
