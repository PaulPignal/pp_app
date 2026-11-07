import { afterEach, describe, expect, it, vi } from 'vitest'

const STRONG = 'a-strong-random-secret-of-at-least-32-chars'
const OTHER = 'another-strong-random-secret-of-32-chars-min'
// Valeur factice de la CI d'ingestion (.github/workflows/*-refresh.yml) : doit passer.
const CI_PLACEHOLDER = 'ci-ingestion-placeholder-not-a-real-secret'

async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries({ DATABASE_URL: 'postgresql://u:p@h/db', ...vars })) {
    vi.stubEnv(key, value)
  }
  return import('@/server/env')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('server env', () => {
  it('accepte un secret de 32 caractères ou plus, dont la valeur factice de la CI', async () => {
    expect(CI_PLACEHOLDER.length).toBeGreaterThanOrEqual(32)
    const { env } = await loadEnv({ NEXTAUTH_SECRET: CI_PLACEHOLDER, INVITE_TOKEN_SECRET: undefined })
    expect(env.NEXTAUTH_SECRET).toBe(CI_PLACEHOLDER)
  })

  it('refuse un secret trop court', async () => {
    await expect(loadEnv({ NEXTAUTH_SECRET: 'short' })).rejects.toThrow(/NEXTAUTH_SECRET must be at least 32/)
  })

  it('refuse la valeur d’exemple de .env.example', async () => {
    await expect(
      loadEnv({ NEXTAUTH_SECRET: STRONG, INVITE_TOKEN_SECRET: 'replace-with-a-second-long-random-secret' }),
    ).rejects.toThrow(/INVITE_TOKEN_SECRET still holds the .env.example placeholder/)
  })

  it('exige INVITE_TOKEN_SECRET en production', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', NEXTAUTH_SECRET: STRONG, INVITE_TOKEN_SECRET: undefined }),
    ).rejects.toThrow(/INVITE_TOKEN_SECRET is required in production/)
    const { env } = await loadEnv({ NODE_ENV: 'production', NEXTAUTH_SECRET: STRONG, INVITE_TOKEN_SECRET: OTHER })
    expect(env.INVITE_TOKEN_SECRET).toBe(OTHER)
  })

  it('retombe sur NEXTAUTH_SECRET hors production', async () => {
    const { env } = await loadEnv({ NODE_ENV: 'development', NEXTAUTH_SECRET: STRONG, INVITE_TOKEN_SECRET: undefined })
    expect(env.INVITE_TOKEN_SECRET).toBe(STRONG)
  })
})
