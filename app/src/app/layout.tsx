import type { Metadata, Viewport } from 'next'
import { Manrope, Newsreader } from 'next/font/google'
import './globals.css'
import Providers from '@/shared/ui/Providers'
import AppShell from '@/shared/ui/AppShell'

export const metadata: Metadata = {
  title: { default: 'Offi', template: '%s · Offi' },
  description: 'Sorties à Paris à découvrir d’un geste : théâtre, cinéma, expositions, concerts, visites, jeune public et streaming.',
  applicationName: 'Offi',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#2f333c' },
    { media: '(prefers-color-scheme: light)', color: '#f3ede3' },
  ],
}

// Police d'interface (variable) et police de titrage (une seule graisse, sous-ensemble latin).
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' })
const newsreader = Newsreader({ subsets: ['latin'], weight: ['500'], style: ['normal'], variable: '--font-newsreader', display: 'swap' })

// Applique le thème (clair/sombre) AVANT le paint pour éviter tout flash :
// préférence stockée si elle existe, sinon la préférence de l'OS. Défaut = sombre.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${manrope.variable} ${newsreader.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
