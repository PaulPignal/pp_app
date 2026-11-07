import { z } from 'zod'

export const isProduction = process.env.NODE_ENV === 'production'

// Secret de signature : 32 caractères minimum, jamais la valeur d'exemple de .env.example.
const signingSecret = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .min(32, `${name} must be at least 32 characters`)
    .refine((value) => !value.startsWith('replace-with'), `${name} still holds the .env.example placeholder`)

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    NEXTAUTH_SECRET: signingSecret('NEXTAUTH_SECRET'),
    INVITE_TOKEN_SECRET: signingSecret('INVITE_TOKEN_SECRET').optional(),
  })
  .refine((data) => !isProduction || data.INVITE_TOKEN_SECRET, {
    message: 'INVITE_TOKEN_SECRET is required in production',
  })

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues.map((issue) => issue.message).join('; ')
  throw new Error(`Invalid server environment: ${details}`)
}

export const env = {
  DATABASE_URL: parsedEnv.data.DATABASE_URL,
  NEXTAUTH_SECRET: parsedEnv.data.NEXTAUTH_SECRET,
  // Repli sur NEXTAUTH_SECRET hors production seulement (le schéma l'interdit en production).
  INVITE_TOKEN_SECRET: parsedEnv.data.INVITE_TOKEN_SECRET ?? parsedEnv.data.NEXTAUTH_SECRET,
}
