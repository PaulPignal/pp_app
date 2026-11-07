// Squelette aligné sur la page réelle (barre de sections, carte, barre d'actions)
// pour éviter tout saut de mise en page à l'arrivée des données.
export default function LoadingDiscover() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Chargement des découvertes">
      <div className="pill-strip" aria-hidden>
        {[88, 84, 100, 104, 88, 72, 118].map((w, i) => (
          <div key={i} className="skeleton h-11 rounded-full" style={{ width: w }} />
        ))}
      </div>

      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface" aria-hidden>
        <div className="skeleton aspect-[4/5] max-h-[28rem] w-full rounded-none sm:aspect-[3/2]" />
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
        </div>
      </div>

      <div className="mx-auto flex items-center gap-4" aria-hidden>
        <div className="skeleton h-11 w-11 rounded-full" />
        <div className="skeleton h-14 w-14 rounded-full" />
        <div className="skeleton h-16 w-16 rounded-full" />
      </div>
    </div>
  )
}
