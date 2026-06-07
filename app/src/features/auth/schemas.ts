import { z } from 'zod'

const emailSchema = z.string().trim().toLowerCase().email()

export const registerUserSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(12, 'Le mot de passe doit faire au moins 12 caractères')
    .max(128)
    .refine(
      (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value),
      'Le mot de passe doit mêler minuscules, majuscules et chiffres',
    ),
})

export type RegisterUserInput = z.infer<typeof registerUserSchema>

export function normalizeEmail(email: string) {
  return emailSchema.parse(email)
}
