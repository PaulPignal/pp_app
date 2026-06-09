import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// next/image → <img> simple qui transmet src/alt/onError.
vi.mock('next/image', () => ({
  default: ({ src, alt, onError }: { src: string; alt: string; onError?: () => void }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={onError} />
  ),
}))

import WorkImage from '@/features/works/ui/WorkImage'

describe('WorkImage', () => {
  it('affiche le fallback en l’absence de source', () => {
    render(<WorkImage src={null} alt="x" sizes="80px" fallback={<span>NOIMG</span>} />)
    expect(screen.getByText('NOIMG')).toBeInTheDocument()
  })

  it('un échec ne masque que l’URL fautive : changer de source ré-affiche l’image', () => {
    const { rerender } = render(
      <WorkImage src="https://files.offi.fr/a.jpg" alt="A" sizes="80px" fallback={<span>NOIMG</span>} />,
    )
    // erreur de chargement sur A → fallback
    fireEvent.error(screen.getByAltText('A'))
    expect(screen.getByText('NOIMG')).toBeInTheDocument()

    // carte suivante (nouvelle URL) → l'image revient (l'échec n'est pas collant)
    rerender(<WorkImage src="https://files.offi.fr/b.jpg" alt="B" sizes="80px" fallback={<span>NOIMG</span>} />)
    expect(screen.getByAltText('B')).toBeInTheDocument()
    expect(screen.queryByText('NOIMG')).not.toBeInTheDocument()
  })
})
