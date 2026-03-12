import Image from 'next/image'
import type { WorkCardDto } from '@/features/works/dto'
import BadgeCategory from '@/features/works/ui/BadgeCategory'
import { formatDateRange, formatDuration, formatPriceRange } from '@/features/works/ui/work-formatters'

export default function CardWork({ work }: { work: WorkCardDto }) {
  const dateLabel = formatDateRange(work.startDate, work.endDate)
  const priceLabel = formatPriceRange(work.priceMin, work.priceMax)
  const durationLabel = formatDuration(work.durationMin)
  const description = work.description?.trim()

  return (
    <article
      className="flex h-full w-full flex-col overflow-hidden rounded-[1.85rem] bg-[color:var(--color-surface-strong)] outline-none"
      tabIndex={-1}
      aria-describedby={`work-${work.id}-title`}
    >
      <div className="relative min-h-[18rem] flex-1 overflow-hidden rounded-[1.85rem] bg-muted">
        {work.imageUrl ? (
          <Image
            src={work.imageUrl}
            alt={work.title}
            fill
            sizes="(max-width: 768px) 100vw, 480px"
            className="object-cover transition duration-500"
            priority
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#fff3,transparent_55%)] text-sm text-muted-foreground">
            Aucune image
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

        {work.category ? (
          <div className="pointer-events-none absolute left-3 top-3">
            <BadgeCategory category={work.category} />
          </div>
        ) : null}

        <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1 text-white">
            {work.venue ? (
              <p className="text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-white/80">{work.venue}</p>
            ) : null}
            <h2 id={`work-${work.id}-title`} className="max-w-[18rem] text-[1.9rem] font-semibold leading-[1.02] tracking-[-0.05em]">
              {work.title}
            </h2>
          </div>

          <span className="rounded-full border border-white/35 bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-white backdrop-blur-sm">
            {work.section === 'cinema' ? 'Cinéma' : 'Théâtre'}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="space-y-2">
          {work.address ? <p className="text-sm leading-6 text-muted-foreground">{work.address}</p> : null}
          {description ? <p className="line-clamp-3 text-[0.96rem] leading-7 text-[color:var(--color-text-muted)]">{description}</p> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MetaStat label="Dates" value={dateLabel} />
          <MetaStat label="Budget" value={priceLabel} />
          {durationLabel ? <MetaStat label="Durée" value={durationLabel} /> : null}
          {work.venue ? <MetaStat label="Lieu" value={work.venue} /> : null}
        </div>

        {work.sourceUrl ? (
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-[color:var(--color-border)] pt-4">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">
              Source officielle
            </span>
            <a
              href={work.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-[color:var(--color-accent)] underline-offset-4 transition hover:underline"
            >
              Voir sur Offi.fr
            </a>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-[color:var(--color-border)] bg-[rgba(255,255,255,0.72)] px-4 py-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-[color:var(--color-text)]">{value}</p>
    </div>
  )
}
