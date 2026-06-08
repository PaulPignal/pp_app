import Image from 'next/image'
import { splitGenres } from '@/features/works/category'
import type { WorkCardDto } from '@/features/works/dto'
import ExpandableDescription from '@/features/works/ui/ExpandableDescription'
import { formatDuration, formatPriceRange } from '@/features/works/ui/work-formatters'

export default function CardWork({ work }: { work: WorkCardDto }) {
  const durationLabel = formatDuration(work.durationMin)
  const priceLabel = formatPriceRange(work.priceMin, work.priceMax)
  const description = work.description?.trim()
  const genres = splitGenres(work.category).slice(0, 3)
  const sectionLabel = work.section === 'cinema' ? 'Cinéma' : 'Théâtre'
  const directorLabel = work.section === 'cinema' ? 'De' : 'Mise en scène'
  const hasFacts = genres.length > 0 || Boolean(durationLabel) || Boolean(priceLabel)

  return (
    <article
      className="flex h-full w-full flex-col overflow-hidden rounded-[1.85rem] bg-[color:var(--color-surface-strong)] outline-none"
      tabIndex={-1}
      aria-describedby={`work-${work.id}-title`}
    >
      <div className="relative min-h-[14rem] flex-1 overflow-hidden rounded-[1.85rem] bg-muted">
        {work.imageUrl ? (
          <Image
            src={work.imageUrl}
            alt={work.title}
            fill
            sizes="(max-width: 768px) 100vw, 480px"
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#fff3,transparent_55%)] text-sm text-muted-foreground">
            Aucune image
          </div>
        )}

        <span className="absolute right-3 top-3 rounded-full border border-white/35 bg-black/35 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-white backdrop-blur-sm">
          {sectionLabel}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-5">
        <div className="space-y-1.5">
          {work.venue ? (
            <p className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-text-muted)]">
              📍 {work.venue}
            </p>
          ) : null}
          <h2
            id={`work-${work.id}-title`}
            className="text-[1.6rem] font-semibold leading-[1.05] tracking-[-0.04em] text-[color:var(--color-text)]"
          >
            {work.title}
          </h2>
        </div>

        {work.director || work.cast.length > 0 ? (
          <div className="space-y-0.5 text-sm leading-6">
            {work.director ? (
              <p>
                <span className="text-[color:var(--color-text-muted)]">{directorLabel} </span>
                <span className="font-semibold text-[color:var(--color-text)]">{work.director}</span>
              </p>
            ) : null}
            {work.cast.length > 0 ? (
              <p>
                <span className="text-[color:var(--color-text-muted)]">Avec </span>
                <span className="font-medium text-[color:var(--color-text)]">{work.cast.slice(0, 5).join(', ')}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {hasFacts ? (
          <div className="flex flex-wrap items-center gap-2">
            {genres.map((genre) => (
              <span
                key={genre}
                className="rounded-full border border-[color:var(--color-border)] bg-white/70 px-3 py-1 text-xs font-semibold capitalize text-[color:var(--color-text)]"
              >
                {genre}
              </span>
            ))}
            {durationLabel ? (
              <span className="rounded-full bg-[rgba(54,39,24,0.06)] px-3 py-1 text-xs font-medium text-[color:var(--color-text)]">
                ⏱️ {durationLabel}
              </span>
            ) : null}
            {priceLabel ? (
              <span className="rounded-full bg-[rgba(54,39,24,0.06)] px-3 py-1 text-xs font-medium text-[color:var(--color-text)]">
                💶 {priceLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        {description ? <ExpandableDescription text={description} /> : null}

        {work.sourceUrl ? (
          <a
            href={work.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex w-fit items-center gap-1 text-xs font-medium text-[color:var(--color-text-muted)] underline-offset-4 transition hover:text-[color:var(--color-accent)] hover:underline"
          >
            Voir sur Offi.fr <span aria-hidden>↗</span>
          </a>
        ) : null}
      </div>
    </article>
  )
}
