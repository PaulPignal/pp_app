import type { ElementType, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type SurfaceTone = 'default' | 'muted' | 'accent'

type SurfaceCardProps<T extends ElementType> = {
  as?: T
  children: ReactNode
  className?: string
  tone?: SurfaceTone
}

export default function SurfaceCard<T extends ElementType = 'section'>({
  as,
  children,
  className,
  tone = 'default',
}: SurfaceCardProps<T>) {
  const Component = as ?? 'section'

  return (
    <Component
      className={cn(
        'surface-card',
        tone === 'muted' && 'surface-card--muted',
        tone === 'accent' && 'surface-card--accent',
        className,
      )}
    >
      {children}
    </Component>
  )
}
