import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/server/env'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

type InvitePayload = {
  userId: string
  exp: number
}

function toBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function sign(encodedPayload: string) {
  return createHmac('sha256', env.INVITE_TOKEN_SECRET).update(encodedPayload).digest('base64url')
}

export function createInviteToken(userId: string, expiresInMs = ONE_DAY_MS) {
  const payload: InvitePayload = { userId, exp: Date.now() + expiresInMs }
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  return `${encodedPayload}.${sign(encodedPayload)}`
}

export function verifyInviteToken(token: string) {
  const [encodedPayload, providedSignature] = token.split('.')
  if (!encodedPayload || !providedSignature) {
    throw new Error('invalid_invite_token')
  }

  const expectedSignature = sign(encodedPayload)
  const provided = Buffer.from(providedSignature, 'utf8')
  const expected = Buffer.from(expectedSignature, 'utf8')

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error('invalid_invite_token')
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload)) as InvitePayload
  if (!payload.userId || typeof payload.exp !== 'number' || payload.exp < Date.now()) {
    throw new Error('expired_invite_token')
  }

  return payload
}
