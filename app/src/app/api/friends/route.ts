import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { auth } from "@/auth"

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: "no user" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  if (searchParams.get("invite") === "1") {
    // Le "token" d'invitation = mon userId
    return NextResponse.json({ token: me.id });
  }

  const friendships = await prisma.friendship.findMany({ where: { userId: me.id }, include: { friend: true } });
  return NextResponse.json({ friends: friendships.map(f => f.friend) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: "no user" }, { status: 400 });

  const { token } = await req.json(); // token = friend userId
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
