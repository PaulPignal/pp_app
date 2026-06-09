'use client'

import { IconMoon, IconSun } from '@/shared/ui/icons'

// Bascule clair/sombre. Le thème est posé sur <html data-theme> avant le paint
// (script de layout.tsx : préférence stockée, sinon OS). Ici, pas d'état React :
// on lit/écrit data-theme + localStorage au clic, et c'est le CSS qui affiche la
// bonne icône selon le thème (aucun mismatch d'hydratation).
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement
    const next = root.dataset.theme === 'light' ? 'dark' : 'light'
    root.dataset.theme = next
    try {
      localStorage.setItem('theme', next)
    } catch {
      /* stockage indisponible : la bascule reste valable pour la session */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Basculer le thème clair / sombre"
      title="Thème clair / sombre"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-control-bg)] text-[color:var(--color-text)] transition hover:border-[color:var(--color-border-strong)]"
    >
      <IconSun size={17} className="theme-toggle__sun" />
      <IconMoon size={17} className="theme-toggle__moon" />
    </button>
  )
}
