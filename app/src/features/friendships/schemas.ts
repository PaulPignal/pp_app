import { z } from 'zod'

export const friendInviteAcceptSchema = z.object({
  token: z.string().min(32),
})

export const friendEmailAddSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

export const addFriendSchema = z.union([friendInviteAcceptSchema, friendEmailAddSchema])

export type AddFriendInput = z.infer<typeof addFriendSchema>
