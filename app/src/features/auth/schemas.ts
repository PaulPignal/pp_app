import { z } from 'zod'

const emailSchema = z.string().trim().toLowerCase().email()

export const registerUserSchema = z.object({
  email: emailSchema,
  password: z.string().min(6),
})

export type RegisterUserInput = z.infer<typeof registerUserSchema>

export function normalizeEmail(email: string) {
  return emailSchema.parse(email)
}
