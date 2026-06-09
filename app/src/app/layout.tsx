import { Manrope } from "next/font/google"
import "./globals.css"
import Providers from "@/shared/ui/Providers"
import AppShell from "@/shared/ui/AppShell"

export const metadata = { title: "Offi – Tinder culturel", description: "MVP local" }

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
})

// Applique le thème (clair/sombre) AVANT le paint pour éviter tout flash :
// préférence stockée si elle existe, sinon la préférence de l'OS. Défaut = sombre.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={manrope.variable}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
