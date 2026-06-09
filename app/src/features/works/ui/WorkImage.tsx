'use client'

import Image from 'next/image'
import { useState, type ReactNode } from 'react'

type WorkImageProps = {
  src: string | null | undefined
  alt: string
  sizes: string
  className?: string
  priority?: boolean
  // Affiché quand il n'y a pas d'image OU si le chargement échoue (au lieu d'une icône cassée).
  fallback: ReactNode
}

// Image d'œuvre avec repli gracieux : si la source est absente ou échoue à charger,
// on rend le placeholder fourni plutôt que l'icône d'image cassée du navigateur.
export default function WorkImage({ src, alt, sizes, className, priority, fallback }: WorkImageProps) {
  // On mémorise l'URL qui a échoué (et non un booléen) : sinon, comme l'instance
  // est réutilisée d'une carte à l'autre dans le deck, un seul échec masquerait
  // toutes les images suivantes. Ici le repli ne s'applique qu'à l'URL fautive.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!src || failedSrc === src) return <>{fallback}</>
  return (
    <Image
      key={src}
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      onError={() => setFailedSrc(src)}
    />
  )
}
