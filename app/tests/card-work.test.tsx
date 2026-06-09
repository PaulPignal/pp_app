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
  arrondissement: null,
  country: 'États-Unis',
  year: 2008,
  availability: null,
  currency: null,
  cinemaVenueCount: null,
  cinemaVenues: [],
  officialUrl: null,
  sourceUrl: 'https://www.offi.fr/x',
  venueInfo: null,
}

describe('CardWork', () => {
  it('affiche la durée en emoji, n’affiche pas le genre ni la date', () => {
    render(<CardWork work={base} />)

    expect(screen.getByRole('heading', { name: 'Wendy et Lucy' })).toBeInTheDocument()
    // le genre n'est plus affiché (page Découverte condensée)
    expect(screen.queryByText('drame')).not.toBeInTheDocument()
    expect(screen.queryByText('road-movie')).not.toBeInTheDocument()
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

  it('cinéma : affiche la nationalité et l’année', () => {
    render(<CardWork work={{ ...base, venue: null }} />)
    expect(screen.getByText('États-Unis · 2008')).toBeInTheDocument()
  })

  it('affiche un badge « Billets dispo » quand availability=InStock', () => {
    render(<CardWork work={{ ...base, availability: 'InStock' }} />)
    expect(screen.getByText('Billets dispo')).toBeInTheDocument()
  })

  it('affiche « Complet » quand availability=SoldOut', () => {
    render(<CardWork work={{ ...base, availability: 'SoldOut' }} />)
    expect(screen.getByText('Complet')).toBeInTheDocument()
  })

  it('affiche les infos pratiques du lieu (métro + accès)', () => {
    render(
      <CardWork
        work={{
          ...base,
          section: 'theatre',
          venueInfo: { name: 'Théâtre de la Huchette', metro: 'Cluny - La Sorbonne', access: 'Accès PMR', phone: null, city: 'Paris 5e', website: null },
        }}
      />,
    )
    expect(screen.getByText(/Cluny - La Sorbonne/)).toBeInTheDocument()
    expect(screen.getByText(/Accès PMR/)).toBeInTheDocument()
  })

  it('quand le lieu a un site officiel : le nom du lieu est un lien vers la source + bouton copier, sans lien Offi', () => {
    render(
      <CardWork
        work={{
          ...base,
          section: 'theatre',
          venue: 'Théâtre Montparnasse',
          arrondissement: 'Paris 14e',
          country: null,
          year: null,
          venueInfo: {
            name: 'Théâtre Montparnasse',
            metro: null,
            access: null,
            phone: null,
            city: 'Paris 14e',
            website: 'https://www.theatremontparnasse.com',
          },
        }}
      />,
    )
    const link = screen.getByRole('link', { name: /Théâtre Montparnasse/ })
    expect(link).toHaveAttribute('href', 'https://www.theatremontparnasse.com')
    expect(screen.getByRole('button', { name: /copier le lien/i })).toBeInTheDocument()
    // le lien Offi générique disparaît au profit de la source
    expect(screen.queryByText(/Voir sur Offi\.fr/)).not.toBeInTheDocument()
  })

  it('quand la fiche a un lien dédié : le titre devient le lien (vers officialUrl) + bouton copier', () => {
    render(
      <CardWork
        work={{
          ...base,
          section: 'exposition',
          title: 'Gianni Versace Retrospective',
          venue: 'Musée Maillol',
          officialUrl: 'https://gianniversaceretrospective.fr',
          venueInfo: {
            name: 'Musée Maillol',
            metro: null,
            access: null,
            phone: null,
            city: 'Paris 7e',
            website: 'https://www.museemaillol.com',
          },
        }}
      />,
    )
    // le titre pointe vers la page dédiée de l'expo
    const titleLink = screen.getByRole('link', { name: /Gianni Versace Retrospective/ })
    expect(titleLink).toHaveAttribute('href', 'https://gianniversaceretrospective.fr')
    // le nom du lieu reste un lien vers le site du lieu
    expect(screen.getByRole('link', { name: /Musée Maillol/ })).toHaveAttribute('href', 'https://www.museemaillol.com')
    // un seul bouton copier (sur la source primaire = le titre)
    expect(screen.getAllByRole('button', { name: /copier le lien/i })).toHaveLength(1)
    expect(screen.queryByText(/Voir sur Offi\.fr/)).not.toBeInTheDocument()
  })

  it('sans site officiel : conserve le lien Offi de secours', () => {
    render(<CardWork work={{ ...base, section: 'theatre', venue: 'Petit Théâtre', venueInfo: null }} />)
    expect(screen.getByText(/Voir sur Offi\.fr/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /copier le lien/i })).not.toBeInTheDocument()
  })

  it('théâtre : affiche le lieu avec l’arrondissement', () => {
    render(
      <CardWork
        work={{
          ...base,
          section: 'theatre',
          venue: 'Théâtre de la Huchette',
          arrondissement: 'Paris 5e',
          country: null,
          year: null,
        }}
      />,
    )
    expect(screen.getByText(/Théâtre de la Huchette · Paris 5e/)).toBeInTheDocument()
  })
})
