import { z } from 'zod'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, hasPasswordComplexity } from '@/features/auth/password-policy'

const emailSchema = z.string().trim().toLowerCase().email()

export const registerUserSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères`)
    .max(PASSWORD_MAX_LENGTH)
    .refine(hasPasswordComplexity, 'Le mot de passe doit mêler minuscules, majuscules et chiffres'),
})

export type RegisterUserInput = z.infer<typeof registerUserSchema>

export function normalizeEmail(email: string) {
  return emailSchema.parse(email)
}
