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
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <>{fallback}</>
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      priority={priority}
      onError={() => setFailed(true)}
    />
  )
}
