import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type PageHeaderProps = {
  eyebrow?: string
  title: string
  description?: string
  meta?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
}

export default function PageHeader({ eyebrow, title, description, meta, action, children, className }: PageHeaderProps) {
  return (
    <header className={cn('page-header', className)}>
      <div className="page-header__top">
        <div className="space-y-3">
          {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
          <div className="space-y-3">
            <h1 className="page-title">{title}</h1>
            {description ? <p className="page-description">{description}</p> : null}
          </div>
          {meta ? <div className="page-meta">{meta}</div> : null}
        </div>

        {action ? <div className="page-header__action">{action}</div> : null}
      </div>

      {children ? <div className="page-header__content">{children}</div> : null}
    </header>
  )
}
