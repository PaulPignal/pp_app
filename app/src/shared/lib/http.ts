import { NextResponse } from 'next/server'

export type JsonOk<T extends object> = { ok: true } & T
export type JsonErr = { ok: false; error: string; details?: unknown }

export function jsonOk<T extends object>(data: T, init?: number | ResponseInit) {
  const status = typeof init === 'number' ? init : (init as ResponseInit | undefined)?.status ?? 200
  const headers = typeof init === 'number' ? undefined : (init as ResponseInit | undefined)?.headers
  return NextResponse.json({ ok: true, ...data } as JsonOk<T>, { status, headers })
}

export function jsonError(error: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error, details } as JsonErr, { status })
}
