import { NextResponse } from 'next/server'

export type JsonOk<T extends object> = { ok: true } & T
// Une erreur ne renvoie qu'un code : jamais de message interne ni le détail de validation.
export type JsonErr = { ok: false; error: string }

export function jsonOk<T extends object>(data: T, init?: number | ResponseInit) {
  const status = typeof init === 'number' ? init : (init as ResponseInit | undefined)?.status ?? 200
  const headers = typeof init === 'number' ? undefined : (init as ResponseInit | undefined)?.headers
  return NextResponse.json({ ok: true, ...data } as JsonOk<T>, { status, headers })
}

export function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error } satisfies JsonErr, { status })
}

/**
 * Erreur levée par une commande : seuls les codes de `knownCodes` atteignent le client
 * (avec leur statut HTTP) ; tout le reste est journalisé et devient un 500 générique.
 */
export function jsonKnownError(error: unknown, knownCodes: Record<string, number>, logLabel: string) {
  const code = error instanceof Error ? error.message : ''
  const status = Object.hasOwn(knownCodes, code) ? knownCodes[code] : undefined
  if (status) return jsonError(code, status)
  console.error(`[${logLabel}] error:`, error)
  return jsonError('server_error', 500)
}
