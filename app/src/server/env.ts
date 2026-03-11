import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required'),
  INVITE_TOKEN_SECRET: z.string().min(1).optional(),
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  const details = parsedEnv.error.issues.map((issue) => issue.message).join('; ')
  throw new Error(`Invalid server environment: ${details}`)
}

export const env = {
  DATABASE_URL: parsedEnv.data.DATABASE_URL,
  NEXTAUTH_SECRET: parsedEnv.data.NEXTAUTH_SECRET,
  INVITE_TOKEN_SECRET: parsedEnv.data.INVITE_TOKEN_SECRET ?? parsedEnv.data.NEXTAUTH_SECRET,
}

export const isProduction = process.env.NODE_ENV === 'production'
