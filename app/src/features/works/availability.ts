const PARIS_TIME_ZONE = 'Europe/Paris'

function formatDatePart(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error(`Unable to format date in timezone ${timeZone}`)
  }

  return `${year}-${month}-${day}`
}

function getDateOnly(value: string | Date | null | undefined) {
  if (!value) return null
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  if (value.length >= 10) {
    return value.slice(0, 10)
  }

  return null
}

export function getParisTodayDate(date = new Date()) {
  return formatDatePart(date, PARIS_TIME_ZONE)
}

export function getParisTodayStart(date = new Date()) {
  return new Date(`${getParisTodayDate(date)}T00:00:00.000Z`)
}

export function isWorkCurrentlyShowing(endDate: string | Date | null | undefined, now = new Date()) {
  const endDay = getDateOnly(endDate)

  if (!endDay) {
    return true
  }

  return endDay >= getParisTodayDate(now)
}
