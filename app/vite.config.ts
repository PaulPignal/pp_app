// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    // lit l'alias "@" depuis tsconfig.json ⇒ "@/..." fonctionne dans les tests
    tsconfigPaths(),
  ],
  resolve: {
    // redondant avec tsconfigPaths, mais utile si tu veux être explicite :
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.tsx',
    globals: true,
    css: true, // autorise l'import de css/clsx/tw si besoin
    // coverage: { reporter: ['text', 'lcov'] },
  },
})
