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

// Fenêtre de fraîcheur du catalogue offi. Une œuvre que le crawl n'a plus ramenée
// depuis plus longtemps que ça a quitté l'affiche : c'est le seul signal fiable de
// fin de disponibilité, offi ne fournissant aucune date de fin côté cinéma (0 sur
// 661 fiches observées) et ne marquant pas les retraits autrement que par l'absence.
// 21 jours : chaque section est crawlée au moins une fois par semaine. Avec 14 jours,
// un seul run hebdomadaire raté (échec réseau, retard GitHub de plusieurs heures) mettait
// déjà les fiches au bord du masquage, et deux semaines sans flux (workflow désactivé
// par GitHub après 60 jours sans activité, constaté du 09/10 au 07/11/2026) vidaient la
// Découverte. 21 jours tolèrent deux runs hebdomadaires manqués d'affilée. Contrepartie
// assumée : un film sorti des salles reste visible jusqu'à 7 jours de plus (21 au lieu
// de 14) ; si le flux casse plus de trois semaines, le catalogue se vide au lieu
// d'afficher du périmé.
export const STALE_AFTER_DAYS = 21

export function getStaleCutoff(date = new Date()) {
  return new Date(getParisTodayStart(date).getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000)
}

export function isWorkCurrentlyShowing(endDate: string | Date | null | undefined, now = new Date()) {
  const endDay = getDateOnly(endDate)

  if (!endDay) {
    return true
  }

  return endDay >= getParisTodayDate(now)
}
