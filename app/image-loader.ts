// Loader d'images custom (next/image) : chaque image est servie directement par son
// hébergeur, à la taille hébergée la plus proche, sans passer par l'optimiseur Vercel
// (pas de quota, pas de point de panne).
// - offi (files.offi.fr/.../images/<n>/…) : seules les tailles 120, 200 et 1000 existent
//   (les autres redirigent vers une page d'erreur).
// - TMDB (image.tmdb.org/t/p/<taille>/…) : w92 à w500. Plafond w500 : w780 pèse deux fois
//   plus (195 Ko contre 91 Ko mesurés sur une affiche) pour un gain visible faible.
const OFFI_SIZES = [120, 200, 1000]
const TMDB_SIZES = [92, 154, 185, 342, 500]
const TMDB_POSTER = /^(https:\/\/image\.tmdb\.org\/t\/p\/)(?:w\d+|original)(\/.+)$/

const nearest = (sizes: number[], width: number) => sizes.find((s) => s >= width) ?? sizes[sizes.length - 1]

export default function offiImageLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  if (src.includes('files.offi.fr') && /\/images\/\d+\//.test(src)) {
    return src.replace(/\/images\/\d+\//, `/images/${nearest(OFFI_SIZES, width)}/`)
  }
  const tmdb = TMDB_POSTER.exec(src)
  if (tmdb) return `${tmdb[1]}w${nearest(TMDB_SIZES, width)}${tmdb[2]}`
  // Autres hôtes : URL telle quelle (le loader custom remplace l'optimiseur).
  return src
}
