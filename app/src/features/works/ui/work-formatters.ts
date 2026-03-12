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
    return 'Dates à venir'
  } catch {
    return 'Dates à venir'
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
  return 'Tarifs non communiqués'
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
