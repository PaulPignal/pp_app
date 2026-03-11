import Image from 'next/image'
import type { WorkCardDto } from '@/features/works/dto'
import BadgeCategory from '@/features/works/ui/BadgeCategory'

export default function CardWork({ work }: { work: WorkCardDto }) {
  const dateLabel = formatDateRange(work.startDate, work.endDate)
  const priceLabel = formatPriceRange(work.priceMin, work.priceMax)

  return (
    <article className="h-full w-full rounded-2xl outline-none" tabIndex={-1} aria-describedby={`work-${work.id}-title`}>
      <div className="relative h-[55%] w-full overflow-hidden rounded-2xl bg-muted">
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
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Aucune image</div>
        )}

        {work.category ? (
          <div className="pointer-events-none absolute left-3 top-3">
            <BadgeCategory category={work.category} />
          </div>
        ) : null}
      </div>

      <div className="space-y-2 p-4">
        <h2 id={`work-${work.id}-title`} className="line-clamp-2 text-lg font-semibold">
          {work.title}
        </h2>

        <div className="text-sm text-muted-foreground">
          {work.venue ? <div className="truncate">📍 {work.venue}</div> : null}
          {work.startDate || work.endDate ? <div>🗓️ {dateLabel}</div> : null}
        </div>

        {work.priceMin != null || work.priceMax != null ? (
          <div className="text-sm">
            💶 <span className="font-medium">{priceLabel}</span>
          </div>
        ) : null}

        {work.sourceUrl ? (
          <div className="pt-1">
            <a
              href={work.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline underline-offset-4"
            >
              Voir sur Offi.fr
            </a>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function formatDateRange(start: string | null, end: string | null) {
  try {
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }
    if (start && end) {
      const startDate = new Date(start)
      const endDate = new Date(end)
      const sameDay =
        startDate.getFullYear() === endDate.getFullYear() &&
        startDate.getMonth() === endDate.getMonth() &&
        startDate.getDate() === endDate.getDate()
      if (sameDay) {
        return startDate.toLocaleDateString('fr-FR', options)
      }
      return `${startDate.toLocaleDateString('fr-FR', options)} → ${endDate.toLocaleDateString('fr-FR', options)}`
    }
    if (start) {
      return new Date(start).toLocaleDateString('fr-FR', options)
    }
    if (end) {
      return new Date(end).toLocaleDateString('fr-FR', options)
    }
    return 'Dates à venir'
  } catch {
    return 'Dates à venir'
  }
}

function formatPriceRange(min: number | null, max: number | null) {
  const format = (value: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

  if (min != null && max != null) {
    if (min === max) {
      return format(min)
    }
    return `${format(min)} – ${format(max)}`
  }
  if (min != null) {
    return `À partir de ${format(min)}`
  }
  if (max != null) {
    return `Jusqu’à ${format(max)}`
  }
  return 'Tarifs non communiqués'
}
