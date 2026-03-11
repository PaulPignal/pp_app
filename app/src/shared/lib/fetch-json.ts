export type FetchJsonError = Error & {
  code?: string
  details?: unknown
  status?: number
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    const error = new Error(
      typeof payload?.error === 'string' ? payload.error : `http_${response.status}`,
    ) as FetchJsonError
    error.code = typeof payload?.error === 'string' ? payload.error : undefined
    error.details = payload?.details
    error.status = response.status
    throw error
  }

  return payload as T
}
