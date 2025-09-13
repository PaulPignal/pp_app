// src/app/api/register/route.ts
import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { getPrisma } from '@/lib/prisma'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = "force-no-store";

function normalizeEmail(email?: string) {
  return (email || '').toLowerCase().trim()
}

export async function POST(req: Request) {
  try {
    // Import dynamique de Prisma
    const prisma = await getPrisma()
    
    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      return NextResponse.json({ error: 'content_type' }, { status: 400 })
    }

    const body = (await req.json()) as { email?: string; password?: string }
    const email = normalizeEmail(body.email)
    const password = body.password || ''

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'weak_password' }, { status: 400 })
    }

    // Conflit d'email ?
    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists?.passwordHash) {
      // compte traditionnel déjà créé
      return NextResponse.json({ error: 'email_exists' }, { status: 409 })
    }

    const passwordHash = await hash(password, 10)

    // Si l'email existe sans passwordHash (ex: compte créé via autre méthode),
    // on l'upgrade en ajoutant le passwordHash, sinon on crée l'utilisateur.
    const user = exists
      ? await prisma.user.update({
          where: { email },
          data: { passwordHash },
          select: { id: true, email: true },
        })
      : await prisma.user.create({
          data: { email, passwordHash },
          select: { id: true, email: true },
        })

    return NextResponse.json(user, { status: 201 })
  } catch (e: any) {
    // Prisma duplicate unique (au cas où la course se produit)
    if (e?.code === 'P2002') {
      return NextResponse.json({ error: 'email_exists' }, { status: 409 })
    }
    console.error('[POST /api/register] error:', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}