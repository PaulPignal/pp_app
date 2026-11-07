import { z } from 'zod'

export const reactionStatusSchema = z.enum(['LIKE', 'DISLIKE', 'SEEN'])

export const reactionUpsertSchema = z.object({
  workId: z.string().min(1),
  status: reactionStatusSchema,
})

export type ReactionStatusInput = z.infer<typeof reactionStatusSchema>
