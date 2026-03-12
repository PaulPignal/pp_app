export const WORK_SECTION_VALUES = ['theatre', 'cinema'] as const

export type WorkSection = (typeof WORK_SECTION_VALUES)[number]

export const DEFAULT_WORK_SECTION: WorkSection = 'theatre'

export function inferWorkSectionFromUrl(url: string | null | undefined): WorkSection | null {
  if (!url) return null
  if (url.includes('/cinema/')) return 'cinema'
  if (url.includes('/theatre/')) return 'theatre'
  return null
}
