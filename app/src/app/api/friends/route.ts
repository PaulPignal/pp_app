// src/app/api/friends/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
  // 🔁 imports dynamiques pour éviter toute évaluation au build
  const { auth } = await import("@/auth");
  const { prisma } = await import("@/server/db");

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!me) {
    return NextResponse.json({ error: "no user" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  if (searchParams.get("invite") === "1") {
    // Le "token" d'invitation = mon userId
    return NextResponse.json({ token: me.id });
  }

  const friendships = await prisma.friendship.findMany({
    where: { userId: me.id },
    include: { friend: true },
  });

  return NextResponse.json({ friends: friendships.map((f) => f.friend) });
}

export async function POST(req: Request) {
  // 🔁 imports dynamiques
  const { auth } = await import("@/auth");
  const { prisma } = await import("@/server/db");

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!me) {
    return NextResponse.json({ error: "no user" }, { status: 400 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const token = body?.token as string | undefined; // token = friend userId
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  if (token === me.id) return NextResponse.json({ error: "cannot add self" }, { status: 400 });

  // Crée relation bidirectionnelle
  await prisma.friendship.upsert({
    where: { userId_friendId: { userId: me.id, friendId: token } },
    update: {},
    create: { userId: me.id, friendId: token },
  });
  await prisma.friendship.upsert({
    where: { userId_friendId: { userId: token, friendId: me.id } },
    update: {},
    create: { userId: token, friendId: me.id },
  });

  return NextResponse.json({ ok: true });
}
