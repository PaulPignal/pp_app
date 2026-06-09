export function formatDateRange(start: string | null, end: string | null) {
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
    return null
  } catch {
    return null
  }
}

export function formatPriceRange(min: number | null, max: number | null) {
  const format = (value: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)

  if (min != null && max != null) {
    if (min === max) {
      return format(min)
    }
    return `${format(min)} - ${format(max)}`
  }
  if (min != null) {
    return `Dès ${format(min)}`
  }
  if (max != null) {
    return `Jusqu’à ${format(max)}`
  }
  return null
}

// Urgence : à combien de jours se termine la programmation. null si pas de date
// ou échéance lointaine (> 21 j). `urgent` déclenche l'accent visuel.
export function formatEndsIn(endDate: string | null, now: Date = new Date()): { label: string; urgent: boolean; days: number } | null {
  if (!endDate) return null
  const end = new Date(endDate)
  if (Number.isNaN(end.getTime())) return null
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const days = Math.round((endDay.getTime() - startOfToday.getTime()) / 86_400_000)
  if (days < 0) return null
  if (days === 0) return { label: 'Dernier jour', urgent: true, days }
  if (days === 1) return { label: 'Se termine demain', urgent: true, days }
  if (days <= 7) return { label: `Plus que ${days} jours`, urgent: true, days }
  if (days <= 21) return { label: `Encore ${days} jours`, urgent: false, days }
  return null
}

// Disponibilité billetterie (valeurs schema.org) → libellé + tonalité d'affichage.
export type AvailabilityBadge = { label: string; tone: 'success' | 'danger' | 'warning' }

export function formatAvailability(availability: string | null): AvailabilityBadge | null {
  switch (availability) {
    case 'InStock':
    case 'OnlineOnly':
    case 'InStoreOnly':
      return { label: 'Billets dispo', tone: 'success' }
    case 'LimitedAvailability':
    case 'PreOrder':
    case 'PreSale':
    case 'BackOrder':
      return { label: 'Dernières places', tone: 'warning' }
    case 'SoldOut':
    case 'OutOfStock':
      return { label: 'Complet', tone: 'danger' }
    default:
      return null
  }
}

export function formatDuration(durationMin: number | null) {
  if (!durationMin) {
    return null
  }

  const hours = Math.floor(durationMin / 60)
  const minutes = durationMin % 60

  if (hours && minutes) {
    return `${hours} h ${minutes}`
  }
  if (hours) {
    return `${hours} h`
  }
  return `${minutes} min`
}
