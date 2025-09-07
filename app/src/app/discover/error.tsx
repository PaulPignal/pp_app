"use client";
export default function DiscoverError({
  error,
  reset,
}: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Erreur sur Découverte</h1>
      <p className="text-red-600 mt-2">{error?.message ?? "Erreur inconnue"}</p>
      <button
        onClick={() => reset()}
        className="mt-3 border rounded px-3 py-1"
      >
        Réessayer
      </button>
    </div>
  );
}
