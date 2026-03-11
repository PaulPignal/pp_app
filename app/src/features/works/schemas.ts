import { z } from 'zod'

export const listDiscoverWorksParamsSchema = z.object({
  per: z.coerce.number().int().min(1).max(200).default(100),
  since: z
    .string()
    .datetime()
    .optional()
    .transform((value) => (value ? new Date(value) : undefined)),
  category: z.string().trim().min(1).optional(),
})

export type ListDiscoverWorksParams = z.infer<typeof listDiscoverWorksParamsSchema>
