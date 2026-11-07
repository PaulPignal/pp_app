import { z } from 'zod'
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  fitsBcryptLimit,
  hasPasswordComplexity,
} from '@/features/auth/password-policy'

// Seule règle d'email du dépôt (inscription, connexion, ajout d'ami).
export const emailSchema = z.string().trim().toLowerCase().email()

export const registerUserSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères`)
    .refine(fitsBcryptLimit, `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX_BYTES} octets`)
    .refine(hasPasswordComplexity, 'Le mot de passe doit mêler minuscules, majuscules et chiffres'),
})

export type RegisterUserInput = z.infer<typeof registerUserSchema>

export function normalizeEmail(email: string) {
  return emailSchema.parse(email)
}
