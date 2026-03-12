import type { ReactNode } from 'react'
import Image from 'next/image'
import type { WorkCardDto } from '@/features/works/dto'
import BadgeCategory from '@/features/works/ui/BadgeCategory'
import { formatDateRange, formatDuration, formatPriceRange } from '@/features/works/ui/work-formatters'
import { cn } from '@/shared/lib/cn'
import SurfaceCard from '@/shared/ui/SurfaceCard'

type WorkSummaryCardProps = {
  work: WorkCardDto | null
  fallbackTitle: string
  actions?: ReactNode
  className?: string
}

export default function WorkSummaryCard({ work, fallbackTitle, actions, className }: WorkSummaryCardProps) {
  const title = work?.title ?? fallbackTitle
  const dateLabel = work ? formatDateRange(work.startDate, work.endDate) : null
  const priceLabel = work ? formatPriceRange(work.priceMin, work.priceMax) : null
  const durationLabel = work ? formatDuration(work.durationMin) : null
  const description = work?.description?.trim()

  return (
    <SurfaceCard className={cn('flex h-full flex-col overflow-hidden p-0', className)} tone="muted">
      <div className="relative h-48 w-full overflow-hidden bg-muted">
        {work?.imageUrl ? (
          <Image
            src={work.imageUrl}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, 420px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Pas d&apos;image</div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent" />

        <div className="absolute left-4 top-4">
          {work?.category ? <BadgeCategory category={work.category} /> : null}
        </div>

        {work?.section ? (
          <span className="absolute bottom-4 right-4 rounded-full border border-white/35 bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-white backdrop-blur-sm">
            {work.section === 'cinema' ? 'Cinéma' : 'Théâtre'}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="space-y-2">
          <h3 className="line-clamp-2 text-lg font-semibold tracking-[-0.03em] text-[color:var(--color-text)]">{title}</h3>
          {work?.venue ? <p className="text-sm font-medium text-muted-foreground">{work.venue}</p> : null}
          {description ? <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>

        <div className="grid gap-2 text-sm text-[color:var(--color-text)]">
          {dateLabel ? <SummaryRow label="Dates" value={dateLabel} /> : null}
          {priceLabel ? <SummaryRow label="Budget" value={priceLabel} /> : null}
          {durationLabel ? <SummaryRow label="Durée" value={durationLabel} /> : null}
          {work?.address ? <SummaryRow label="Adresse" value={work.address} /> : null}
        </div>

        <div className="mt-auto flex flex-col gap-3 border-t border-[color:var(--color-border)] pt-4">
          {work?.sourceUrl ? (
            <a
              href={work.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-[color:var(--color-accent)] transition hover:underline"
            >
              Voir la source
            </a>
          ) : null}

          {actions}
        </div>
      </div>
    </SurfaceCard>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-[1rem] border border-[color:var(--color-border)] bg-white/60 px-3 py-2">
      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <span className="text-right font-medium leading-6">{value}</span>
    </div>
  )
}
