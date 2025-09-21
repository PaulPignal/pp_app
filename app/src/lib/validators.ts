// src/lib/validators.ts
import { z } from 'zod'

/**
 * Upsert d'une réaction utilisateur sur une œuvre.
 * - status: LIKE | DISLIKE | SEEN
 */
export const ReactionUpsertSchema = z.object({
  workId: z.string().min(1),
  status: z.enum(['LIKE', 'DISLIKE', 'SEEN']),
})

/**
 * Query params pour /api/works
 * - per: nombre d'items par page (1..200)
 * - since: ISO datetime (filtre date)
 * - category: filtre catégorie (optionnel)
 * - markSeen: compat rétro (si tu en as besoin côté client)
 */
export const WorksQuerySchema = z.object({
  per: z
    .preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(1).max(200))
    .optional(),
  since: z.string().datetime().optional(),
  category: z.string().min(1).optional(),
  markSeen: z.enum(['0', '1']).optional(),
})

/**
 * Autres schémas existants, inchangés
 */
export const CommonQuerySchema = z.object({
  friendId: z.string().min(1),
})

export const FriendInviteAcceptSchema = z.object({
  token: z.string().min(16),
})