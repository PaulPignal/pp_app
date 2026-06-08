import { z } from 'zod'

export const friendInviteAcceptSchema = z.object({
  token: z.string().min(32),
})

export const friendEmailAddSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

export const addFriendSchema = z.union([friendInviteAcceptSchema, friendEmailAddSchema])

export type AddFriendInput = z.infer<typeof addFriendSchema>

// Accepter / refuser une demande reçue (de requesterId).
export const friendRequestActionSchema = z.object({
  requesterId: z.string().min(1),
  action: z.enum(['accept', 'decline']),
})

export type FriendRequestActionInput = z.infer<typeof friendRequestActionSchema>

// Retirer un ami.
export const removeFriendSchema = z.object({
  friendId: z.string().min(1),
})
