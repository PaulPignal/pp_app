import { describe, it, expect, vi, beforeEach } from 'vitest'

const { registerUserMock } = vi.hoisted(() => ({ registerUserMock: vi.fn() }))
vi.mock('@/features/auth/server/commands', () => ({ registerUser: registerUserMock }))

import { __resetRateLimit } from '@/shared/lib/rate-limit'
import { POST } from '@/app/api/register/route'

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimit()
  })

  it('201 et renvoie l’utilisateur en cas de succès', async () => {
    registerUserMock.mockResolvedValue({ id: 'u1', email: 'a@b.com' })
    const res = await post({ email: 'a@b.com', password: 'Secret123four' })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ ok: true, user: { id: 'u1', email: 'a@b.com' } })
  })

  it('400 si email invalide ou mot de passe trop court (validé avant la commande)', async () => {
    const res = await post({ email: 'not-an-email', password: '123' })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ ok: false, error: 'invalid_body' })
    expect(registerUserMock).not.toHaveBeenCalled()
  })

  it('409 quand la commande signale email_exists', async () => {
    registerUserMock.mockRejectedValue(new Error('email_exists'))
    const res = await post({ email: 'a@b.com', password: 'Secret123four' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ ok: false, error: 'email_exists' })
  })

  it('500 générique sur erreur inattendue (sans fuite du message interne)', async () => {
    registerUserMock.mockRejectedValue(new Error('connection refused at 10.0.0.5'))
    const res = await post({ email: 'a@b.com', password: 'Secret123four' })
    expect(res.status).toBe(500)
    const payload = await res.json()
    expect(payload.error).toBe('server_error')
    expect(JSON.stringify(payload)).not.toContain('10.0.0.5')
  })
})
