import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { IconX } from '@/shared/ui/icons'

type StatusBannerTone = 'error' | 'success' | 'info'

type StatusBannerProps = {
  children: ReactNode
  tone?: StatusBannerTone
  floating?: boolean
  onDismiss?: () => void
  className?: string
}

// Bandeau d'état. Une erreur est annoncée immédiatement (alert), le reste poliment (status).
export default function StatusBanner({ children, tone = 'info', floating = false, onDismiss, className }: StatusBannerProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'notice',
        tone === 'error' && 'notice-error',
        tone === 'success' && 'notice-success',
        floating && 'notice-floating',
        className,
      )}
    >
      <span className="min-w-0 flex-1 py-0.5">{children}</span>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="btn-icon -my-2 -mr-2 h-9 w-9 shrink-0 text-current" aria-label="Fermer le message">
          <IconX size={16} />
        </button>
      ) : null}
    </div>
  )
}
