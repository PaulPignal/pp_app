// src/types/Work.ts
export type Work = {
  id: string
  title: string
  imageUrl?: string | null
  category?: string | null
  venue?: string | null
  address?: string | null
  description?: string | null
  startDate?: string | null
  endDate?: string | null
  durationMin?: number | null
  priceMin?: number | null
  priceMax?: number | null
  sourceUrl?: string | null   // <- optionnel + nullable
}
