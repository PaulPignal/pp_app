import { z } from 'zod'

export const commonQuerySchema = z.object({
  friendId: z.string().min(1),
})
