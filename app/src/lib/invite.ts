import { createHmac, timingSafeEqual } from 'node:crypto'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

type InvitePayload = {
  userId: string
  exp: number
}

function getInviteSecret() {
  const secret = process.env.INVITE_TOKEN_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret || secret === 'changeme') {
    throw new Error('invite_secret_missing')
  }
  return secret
}

function toBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function sign(encodedPayload: string, secret: string) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

export function createInviteToken(userId: string, expiresInMs = ONE_DAY_MS) {
  const payload: InvitePayload = { userId, exp: Date.now() + expiresInMs }
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = sign(encodedPayload, getInviteSecret())
  return `${encodedPayload}.${signature}`
}

export function verifyInviteToken(token: string) {
  const [encodedPayload, providedSignature] = token.split('.')
  if (!encodedPayload || !providedSignature) {
    throw new Error('invalid_invite_token')
  }

  const expectedSignature = sign(encodedPayload, getInviteSecret())
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
