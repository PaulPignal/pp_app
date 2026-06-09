import { z } from 'zod'
import { WORK_SECTION_VALUES } from '@/features/works/section'

export const listDiscoverWorksParamsSchema = z.object({
  per: z.coerce.number().int().min(1).max(200).default(100),
  since: z
    .string()
      .datetime()
      .optional()
      .transform((value) => (value ? new Date(value) : undefined)),
  category: z.string().trim().min(1).optional(),
  section: z.enum(WORK_SECTION_VALUES).optional(),
  // Filtre plateformes streaming (CSV "Netflix,Disney+" ou tableau).
  platforms: z
    .preprocess(
      (value) =>
        Array.isArray(value)
          ? value
          : typeof value === 'string'
            ? value.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
      z.array(z.string().min(1)).max(40).optional(),
    )
    .transform((value) => (value && value.length > 0 ? value : undefined)),
})

export type ListDiscoverWorksParams = z.infer<typeof listDiscoverWorksParamsSchema>
