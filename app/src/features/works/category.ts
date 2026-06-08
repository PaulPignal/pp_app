// La catégorie brute renvoyée par Offi est souvent dupliquée/concaténée
// ("drame - drame / road-movie"). On découpe sur " / ", " · " et " - " (avec
// espaces autour, pour préserver les genres composés type "road-movie"), on
// nettoie et on dédoublonne (insensible à la casse, en gardant la 1re graphie).
//
// Partagé entre l'ingestion (offi-import → données propres en base) et
// l'affichage (CardWork → chips), pour une logique unique.

export function splitGenres(category: string | null | undefined): string[] {
  if (!category) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of category.split(/\s*[/·]\s*|\s+-\s+/)) {
    const genre = part.trim()
    if (!genre) continue
    const key = genre.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(genre)
    }
  }
  return out
}

// Normalise une catégorie pour le stockage : genres dédoublonnés rejoints par
// " / ", ou null si rien d'exploitable.
export function cleanCategory(category: string | null | undefined): string | null {
  const genres = splitGenres(category)
  return genres.length > 0 ? genres.join(' / ') : null
}
