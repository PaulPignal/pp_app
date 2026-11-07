'use client'

// Filet de sécurité de dernier recours : ne se déclenche que si le layout racine
// lui-même échoue. Il remplace tout le document, donc les styles globaux ne sont
// pas chargés → styles inline volontaires, alignés sur les tokens du thème clair.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
          background: '#f3ede3',
          color: '#201710',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            background: '#fffdf9',
            border: '1px solid rgba(83,63,43,0.16)',
            borderRadius: 14,
            padding: 28,
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 500, margin: '0 0 8px' }}>L’application n’a pas pu se charger</h1>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.5, color: '#6f5b49' }}>
            Réessayez ; si le problème persiste, revenez un peu plus tard.
          </p>
          {error?.digest ? <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6f5b49' }}>Référence : {error.digest}</p> : null}
          <button
            onClick={() => reset()}
            style={{
              minHeight: 44,
              padding: '10px 20px',
              border: 'none',
              borderRadius: 999,
              background: '#a34628',
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
