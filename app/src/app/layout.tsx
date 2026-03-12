import { Manrope } from "next/font/google"
import "./globals.css"
import Providers from "@/shared/ui/Providers"
import AppShell from "@/shared/ui/AppShell"

export const metadata = { title: "Offi – Tinder culturel", description: "MVP local" }

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={manrope.variable}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
