export default function NotFound() {
  return (
    <div style={{padding:20}}>
      <h1 style={{fontSize:20,fontWeight:600}}>404</h1>
      <p>Cette page n’existe pas.</p>
      <a href="/discover" style={{textDecoration:"underline"}}>Retour à Découverte</a>
    </div>
  );
}
