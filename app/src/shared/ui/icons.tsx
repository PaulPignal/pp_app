// Jeu d'icônes maison (style « line », trait régulier). Remplace les emoji, qui
// faisaient « template » et cassaient la cohérence visuelle. SVG inline → zéro
// dépendance, couleur via currentColor, taille via la prop `size`.
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

export function IconStar({ filled = true, size = 16, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden {...props}>
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L4.5 9.7l5.9-.9z" />
    </svg>
  )
}

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Svg>
)

export const IconTicket = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 7 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-7z" />
    <path d="M14 6.5v11" strokeDasharray="2 2" />
  </Svg>
)

export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
)

export const IconMetro = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="3.5" width="12" height="13" rx="3" />
    <path d="M6 11h12M9.5 16.5l-2 3M14.5 16.5l2 3" />
    <circle cx="9" cy="13.5" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="15" cy="13.5" r="0.6" fill="currentColor" stroke="none" />
  </Svg>
)

export const IconAccess = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="4.5" r="1.6" />
    <path d="M9 8h5l-.5 4H15l2.5 6M9 8v4.5a3.5 3.5 0 0 0 3.5 3.5" />
  </Svg>
)

export const IconFilm = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9h17M3.5 15h17M8 4.5v15M16 4.5v15" />
  </Svg>
)

export const IconTv = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="12" rx="2" />
    <path d="M8 3.5l4 3.5 4-3.5" />
  </Svg>
)

export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.6M16.5 14.2A5.5 5.5 0 0 1 20.5 19" />
  </Svg>
)

export const IconArrowUpRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Svg>
)

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3.5h3l1.5 4-2 1.4a11 11 0 0 0 4.6 4.6l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z" />
  </Svg>
)

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
)

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Svg>
)

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" />
  </Svg>
)

export const IconCheck = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
)
