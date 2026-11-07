'use client'

import { IconMoon, IconSun } from '@/shared/ui/icons'

type Props = {
  // `icon` : bouton rond 44 px (barre du haut). `row` : ligne icône + libellé (barre latérale).
  variant?: 'icon' | 'row'
}

// Bascule clair/sombre. Le thème est posé sur <html data-theme> avant le paint
// (script de layout.tsx : préférence stockée, sinon OS). Ici, pas d'état React :
// lecture/écriture de data-theme + localStorage au clic, et le CSS affiche la
// bonne icône selon le thème (aucun mismatch d'hydratation).
export default function ThemeToggle({ variant = 'icon' }: Props) {
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

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={toggle}
        className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold text-ink-muted transition-colors duration-150 hover:bg-fill hover:text-ink"
      >
        <IconSun size={18} className="theme-toggle__sun" />
        <IconMoon size={18} className="theme-toggle__moon" />
        <span className="theme-toggle__sun">Passer en thème clair</span>
        <span className="theme-toggle__moon">Passer en thème sombre</span>
      </button>
    )
  }

  return (
    <button type="button" onClick={toggle} aria-label="Changer de thème" title="Thème clair / sombre" className="btn-icon">
      <IconSun size={20} className="theme-toggle__sun" />
      <IconMoon size={20} className="theme-toggle__moon" />
    </button>
  )
}
