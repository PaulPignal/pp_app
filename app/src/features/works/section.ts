export const WORK_SECTION_VALUES = ['theatre', 'cinema', 'exposition', 'concert', 'visite', 'enfants'] as const

export type WorkSection = (typeof WORK_SECTION_VALUES)[number]

export const DEFAULT_WORK_SECTION: WorkSection = 'theatre'

// Libellés FR affichés (badges, onglets, filtres).
export const WORK_SECTION_LABELS: Record<WorkSection, string> = {
  theatre: 'Théâtre',
  cinema: 'Cinéma',
  exposition: 'Exposition',
  concert: 'Concert',
  visite: 'Visite',
  enfants: 'Jeune public',
}

export function workSectionLabel(section: string | null | undefined): string {
  return (section && WORK_SECTION_LABELS[section as WorkSection]) || 'Sortie'
}

// Préfixe d'URL offi par section (pour l'inférence depuis une URL).
const SECTION_URL_FRAGMENTS: Array<[WorkSection, string]> = [
  ['cinema', '/cinema/'],
  ['theatre', '/theatre/'],
  ['exposition', '/expositions-musees/'],
  ['concert', '/concerts/'],
  ['visite', '/visites-conferences/'],
  ['enfants', '/enfants/'],
]

export function inferWorkSectionFromUrl(url: string | null | undefined): WorkSection | null {
  if (!url) return null
  for (const [section, fragment] of SECTION_URL_FRAGMENTS) {
    if (url.includes(fragment)) return section
  }
  return null
}

// Libellé du « crédit » principal selon la section (réalisateur / mise en scène /
// artiste…). Utilisé pour préfixer Work.director à l'affichage.
export function workDirectorLabel(section: string | null | undefined): string {
  switch (section) {
    case 'cinema':
    case 'exposition':
      return 'De'
    case 'concert':
    case 'visite':
      return 'Avec'
    default:
      return 'Mise en scène' // theatre, enfants
  }
}
