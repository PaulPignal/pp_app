// --- Polyfill WAAPI pour JSDOM (Element.animate) ---
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest';

if (!('animate' in Element.prototype)) {
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