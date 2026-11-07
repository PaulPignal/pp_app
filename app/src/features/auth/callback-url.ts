const BASE = 'http://internal.invalid'

/**
 * Cible de redirection après connexion : un chemin interne seulement, sinon `/`.
 * Refuse `//hote`, `/\hote` et les caractères de contrôle (un navigateur retire
 * tabulations et retours à la ligne : `/\t/hote` deviendrait `//hote`).
 */
export function safeCallbackUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return '/'
  const url = new URL(value, BASE)
  return url.origin === BASE ? `${url.pathname}${url.search}${url.hash}` : '/'
}
