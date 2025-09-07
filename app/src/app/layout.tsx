import "./globals.css"
import Providers from "@/components/Providers"
import NavBar from "@/components/NavBar"

export const metadata = { title: "Offi – Tinder culturel", description: "MVP local" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-white text-neutral-900">
        {/* SessionProvider côté client pour l'UI conditionnelle */}
        <Providers>
          <header className="border-b">
            <NavBar />
          </header>
          <main className="container mx-auto p-6">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
