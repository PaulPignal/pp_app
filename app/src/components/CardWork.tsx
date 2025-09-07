import Image from 'next/image'
import BadgeCategory from '@/components/BadgeCategory'
import type { Work } from '@/types/Work'

type Props = { work: Work }

export default function CardWork({ work }: { work: Work }) {
  const dateLabel = formatDateRange(work.startDate, work.endDate)
  const priceLabel = formatPriceRange(work.priceMin, work.priceMax)

  return (
    <article className="h-full w-full rounded-2xl outline-none" tabIndex={-1} aria-describedby={`work-${work.id}-title`}>
      {/* Image */}
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

        {/* Badge catégorie en overlay */}
        {work.category && (
          <div className="pointer-events-none absolute left-3 top-3">
            <BadgeCategory category={work.category} />
          </div>
        )}
      </div>

      {/* Infos */}
      <div className="space-y-2 p-4">
        <h2 id={`work-${work.id}-title`} className="line-clamp-2 text-lg font-semibold">
          {work.title}
        </h2>

        {/* Lieu + dates */}
        <div className="text-sm text-muted-foreground">
          {work.venue && <div className="truncate">📍 {work.venue}</div>}
          {(work.startDate || work.endDate) && <div>🗓️ {dateLabel}</div>}
        </div>

        {/* Prix */}
        {(work.priceMin != null || work.priceMax != null) && (
          <div className="text-sm">
            💶 <span className="font-medium">{priceLabel}</span>
          </div>
        )}

        {/* Lien source */}
        {work.sourceUrl && (
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
        )}
      </div>
    </article>
  )
}

function formatDateRange(start?: string | null, end?: string | null) {
  try {
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }
    if (start && end) {
      const s = new Date(start)
      const e = new Date(end)
      const sameDay =
        s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate()
      if (sameDay) return s.toLocaleDateString('fr-FR', opts)
      return `${s.toLocaleDateString('fr-FR', opts)} → ${e.toLocaleDateString('fr-FR', opts)}`
    }
    if (start) return new Date(start).toLocaleDateString('fr-FR', opts)
    if (end) return new Date(end).toLocaleDateString('fr-FR', opts)
    return 'Dates à venir'
  } catch {
    return 'Dates à venir'
  }
}

function formatPriceRange(min?: number | null, max?: number | null) {
  const f = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
  if (min != null && max != null) {
    if (min === max) return f(min)
    return `${f(min)} – ${f(max)}`
  }
  if (min != null) return `À partir de ${f(min)}`
  if (max != null) return `Jusqu’à ${f(max)}`
  return 'Tarifs non communiqués'
}