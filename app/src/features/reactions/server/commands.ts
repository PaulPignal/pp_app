import 'server-only'

import { z } from 'zod'
import { prisma } from '@/server/db'
import { reactionUpsertSchema, reactionWorkQuerySchema, type ReactionStatusInput } from '@/features/reactions/schemas'

const userIdSchema = z.object({ userId: z.string().min(1) })
const setReactionStatusSchema = reactionUpsertSchema.extend(userIdSchema.shape)
const clearReactionSchema = reactionWorkQuerySchema.extend(userIdSchema.shape)

export async function setReactionStatus(input: { userId: string; workId: string; status: ReactionStatusInput }) {
  const { userId, workId, status } = setReactionStatusSchema.parse(input)

  // Un seul aller-retour : l'upsert suffit (l'ancien statut n'était lu par aucun appelant).
  const reaction = await prisma.reaction.upsert({
    where: { userId_workId: { userId, workId } },
    update: { status },
    create: { userId, workId, status },
    select: { workId: true, status: true },
  })

  return { reaction }
}

// Efface la réaction (user, work) → l'œuvre redevient éligible au deck Discover
// (anti-jointure `reactions: { none }`). Idempotent : aucune erreur si déjà absente.
export async function clearReaction(input: { userId: string; workId: string }) {
  const { userId, workId } = clearReactionSchema.parse(input)
  const { count } = await prisma.reaction.deleteMany({ where: { userId, workId } })
  return { cleared: count > 0 }
}
