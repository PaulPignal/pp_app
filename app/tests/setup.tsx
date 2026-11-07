// --- Polyfill WAAPI pour JSDOM (Element.animate) ---
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest';

if (typeof Element !== 'undefined' && !('animate' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: function (_keyframes: any, _options?: any) {
      // Objet d'animation minimal, déjà "terminé"
      return {
        finished: Promise.resolve(),
        playState: 'finished',
        cancel: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
    },
  });
}

// Node ≥ 22 expose un `localStorage` natif inerte (sans --localstorage-file) qui
// masque celui de JSDOM : on le remplace par un stockage en mémoire pour que les
// tests passent quelle que soit la version de Node.
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear() {
    this.store.clear()
  }
  getItem(key: string) {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value))
  }
}

{
  const native = (globalThis as { localStorage?: Storage }).localStorage
  if (!native || typeof native.getItem !== 'function') {
    const memory = new MemoryStorage()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => memory })
  }
}

// `matchMedia` n'existe pas dans JSDOM : stub neutre (aucune préférence active).
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

// Toujours stubber fetch AVANT les tests
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  } as any),
)

// (facultatif, pour éviter d'autres soucis d'URL relatives)
if (typeof window !== 'undefined' && window.location?.href === 'about:blank') {
  // @ts-ignore
  window.location.href = 'http://localhost/'
}
