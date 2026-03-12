'use client'

import Link from 'next/link'
import { cn } from '@/shared/lib/cn'

type SegmentedItem = {
  label: string
  value: string
  href?: string
  count?: number
  disabled?: boolean
}

type SegmentedControlProps = {
  items: SegmentedItem[]
  value: string
  ariaLabel: string
  onChange?: (value: string) => void
  fullWidth?: boolean
}

export default function SegmentedControl({
  items,
  value,
  ariaLabel,
  onChange,
  fullWidth = false,
}: SegmentedControlProps) {
  return (
    <div
      className={cn('segmented-control', fullWidth && 'segmented-control--full')}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const active = item.value === value
        const className = cn(
          'segmented-control__item',
          fullWidth && 'segmented-control__item--full',
          active && 'segmented-control__item--active',
        )

        const content = (
          <>
            <span>{item.label}</span>
            {typeof item.count === 'number' ? <span className="segmented-control__count">{item.count}</span> : null}
          </>
        )

        if (item.href) {
          return (
            <Link
              key={item.value}
              href={item.href}
              className={className}
              aria-current={active ? 'page' : undefined}
              role="tab"
              aria-selected={active}
            >
              {content}
            </Link>
          )
        }

        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={className}
            onClick={() => onChange?.(item.value)}
            disabled={item.disabled}
          >
            {content}
          </button>
        )
      })}
    </div>
  )
}
