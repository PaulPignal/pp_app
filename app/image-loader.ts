// Loader d'images custom (next/image). Pour les images offi (files.offi.fr/.../images/<n>/…),
// on pioche directement la taille hébergée par offi la plus adaptée → l'image est servie
// DIRECTEMENT par offi, sans passer par l'optimiseur Vercel (pas de quota, pas de point
// de panne). offi n'expose que ces 3 tailles (les autres redirigent vers une page d'erreur).
const OFFI_SIZES = [120, 200, 1000]

export default function offiImageLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  if (!src.includes('files.offi.fr') || !/\/images\/\d+\//.test(src)) {
    // Hors offi : on sert l'URL telle quelle (le loader custom remplace l'optimiseur).
    return src
  }
  const size = OFFI_SIZES.find((s) => s >= width) ?? OFFI_SIZES[OFFI_SIZES.length - 1]
  return src.replace(/\/images\/\d+\//, `/images/${size}/`)
}
