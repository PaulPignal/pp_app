import type { ElementType, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type SurfaceTone = 'default' | 'muted'

type SurfaceCardProps<T extends ElementType> = {
  as?: T
  children: ReactNode
  className?: string
  tone?: SurfaceTone
}

// Carte : surface + filet, sans ombre ni dégradé. `muted` = fond discret sans filet.
export default function SurfaceCard<T extends ElementType = 'section'>({
  as,
  children,
  className,
  tone = 'default',
}: SurfaceCardProps<T>) {
  const Component = as ?? 'section'

  return <Component className={cn('card p-5', tone === 'muted' && 'border-transparent bg-fill', className)}>{children}</Component>
}
