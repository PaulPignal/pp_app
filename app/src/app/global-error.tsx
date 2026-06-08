'use client'

// Filet de sécurité de dernier recours : ne se déclenche que si le layout racine
// lui-même échoue. Il remplace tout le document, donc les styles globaux ne sont
// pas chargés → styles inline volontaires, et palette alignée sur la marque.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          background: '#faf6f0',
          color: '#2a1e12',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            background: '#fff',
            border: '1px solid rgba(42,30,18,0.08)',
            borderRadius: 20,
            padding: 28,
            boxShadow: '0 18px 40px rgba(42,30,18,0.08)',
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>Quelque chose s’est mal passé</h1>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: '#6b5d4d' }}>
            Désolé, l’application n’a pas pu se charger. Réessaie ; si le problème persiste, reviens un peu plus tard.
          </p>
          {error?.digest ? (
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#9a8c7a' }}>Référence : {error.digest}</p>
          ) : null}
          <button
            onClick={() => reset()}
            style={{
              padding: '10px 16px',
              border: 'none',
              borderRadius: 12,
              background: '#0f5d5e',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  )
}
