import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WorkCardDto } from '@/features/works/dto'

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <div aria-label={alt} data-testid="mock-image" />,
}))

import CardWork from '@/features/works/ui/CardWork'

const base: WorkCardDto = {
  id: 'w1',
  title: 'Wendy et Lucy',
  section: 'cinema',
  imageUrl: null,
  category: 'drame - drame / road-movie',
  venue: 'Le Champo',
  address: null,
  description: 'A'.repeat(200),
  startDate: '2009-04-08T00:00:00.000Z',
  endDate: null,
  durationMin: 80,
  priceMin: null,
  priceMax: null,
  director: 'Kelly Reichardt',
  cast: ['Michelle Williams', 'Will Oldham'],
  sourceUrl: 'https://www.offi.fr/x',
}

describe('CardWork', () => {
  it('dédoublonne le genre, affiche la durée en emoji, et n’affiche aucune date', () => {
    render(<CardWork work={base} />)

    expect(screen.getByRole('heading', { name: 'Wendy et Lucy' })).toBeInTheDocument()
    // genre nettoyé : "drame" une seule fois (dédoublonné), + "road-movie" intact
    expect(screen.getAllByText('drame')).toHaveLength(1)
    expect(screen.getByText('road-movie')).toBeInTheDocument()
    // durée en emoji, pas de label "DURÉE"
    expect(screen.getByText(/1 h 20/)).toBeInTheDocument()
    expect(screen.queryByText(/DURÉE/i)).not.toBeInTheDocument()
    // la date est retirée
    expect(screen.queryByText(/2009/)).not.toBeInTheDocument()
    expect(screen.queryByText(/avr\./)).not.toBeInTheDocument()
  })

  it('affiche le réalisateur et le casting (signal de décision)', () => {
    render(<CardWork work={base} />)
    expect(screen.getByText(/Kelly Reichardt/)).toBeInTheDocument()
    expect(screen.getByText(/Michelle Williams/)).toBeInTheDocument()
  })

  it('« Voir plus » déplie la description complète', async () => {
    const user = userEvent.setup()
    render(<CardWork work={base} />)

    await user.click(screen.getByRole('button', { name: /voir plus/i }))
    expect(screen.getByRole('button', { name: /voir moins/i })).toBeInTheDocument()
  })

  it('n’affiche pas de fait quand la donnée est absente (pas de placeholder)', () => {
    render(<CardWork work={{ ...base, durationMin: null, priceMin: null, priceMax: null, category: null }} />)
    expect(screen.queryByText(/Tarifs non communiqués/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Dates à venir/)).not.toBeInTheDocument()
  })
})
