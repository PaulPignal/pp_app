import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type StatusBannerTone = 'error' | 'success' | 'info'

type StatusBannerProps = {
  children: ReactNode
  tone?: StatusBannerTone
  floating?: boolean
  className?: string
}

export default function StatusBanner({ children, tone = 'info', floating = false, className }: StatusBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        'status-banner',
        tone === 'error' && 'status-banner--error',
        tone === 'success' && 'status-banner--success',
        tone === 'info' && 'status-banner--info',
        floating && 'app-float-banner',
        className,
      )}
    >
      {children}
    </div>
  )
}
