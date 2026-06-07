import 'server-only'

import { z } from 'zod'
import { prisma } from '@/server/db'

const setReactionStatusSchema = z.object({
  userId: z.string().min(1),
  workId: z.string().min(1),
  status: z.enum(['LIKE', 'DISLIKE', 'SEEN']),
})

export async function setReactionStatus(input: { userId: string; workId: string; status: 'LIKE' | 'DISLIKE' | 'SEEN' }) {
  const { userId, workId, status } = setReactionStatusSchema.parse(input)

  const previous = await prisma.reaction.findUnique({
    where: { userId_workId: { userId, workId } },
    select: { status: true },
  })

  const reaction = await prisma.reaction.upsert({
    where: { userId_workId: { userId, workId } },
    update: { status },
    create: { userId, workId, status },
  })

  return {
    reaction,
    previousStatus: previous?.status ?? null,
    alreadyExisted: previous?.status === status,
  }
}

const clearReactionSchema = z.object({
  userId: z.string().min(1),
  workId: z.string().min(1),
})

// Efface la réaction (user, work) → l'œuvre redevient éligible au deck Discover
// (anti-jointure `reactions: { none }`). Idempotent : aucune erreur si déjà absente.
export async function clearReaction(input: { userId: string; workId: string }) {
  const { userId, workId } = clearReactionSchema.parse(input)
  const { count } = await prisma.reaction.deleteMany({ where: { userId, workId } })
  return { cleared: count > 0 }
}
