import { z } from 'zod'

export const LikeCreateSchema = z.object({
  workId: z.string().min(1),
})

export const LikeDeleteQuerySchema = z.object({
  workId: z.string().min(1),
})

export const WorksQuerySchema = z.object({
  per: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(1).max(100)).optional(),
  since: z.string().datetime().optional(), // ISO
  category: z.string().min(1).optional(),
  markSeen: z.enum(['0', '1']).optional(),
})

export const CommonQuerySchema = z.object({
  friendId: z.string().min(1),
})

export const FriendInviteAcceptSchema = z.object({
  token: z.string().min(16),
})
