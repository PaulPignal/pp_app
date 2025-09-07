"use client";
export default function GlobalError({
  error,
  reset,
}: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <html>
      <body style={{padding:20,fontFamily:"ui-sans-serif,system-ui"}}>
        <h1 style={{fontSize:20,fontWeight:600}}>Une erreur est survenue</h1>
        <p style={{marginTop:8,color:"#555"}}>{error?.message ?? "Erreur inconnue"}</p>
        <button onClick={() => reset()} style={{marginTop:12,padding:"8px 12px",border:"1px solid #ddd",borderRadius:8}}>
          Réessayer
        </button>
      </body>
    </html>
  );
}
