// src/app/api/friends/route.ts
import { NextResponse } from "next/server";
import { FriendAddSchema } from "@/lib/validators";
import { createInviteToken, verifyInviteToken } from "@/lib/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: Request) {
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
    return NextResponse.json({ token: createInviteToken(me.id) });
  }

  const friendships = await prisma.friendship.findMany({
    where: { userId: me.id },
    select: {
      friend: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  return NextResponse.json({ friends: friendships.map((f) => f.friend) });
}

export async function POST(req: Request) {
  const { auth } = await import("@/auth");
  const { prisma } = await import("@/server/db");

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauth" }, { status: 401 });
  }
  const sessionEmail = session.user.email.toLowerCase().trim();

  const me = await prisma.user.findUnique({ where: { email: sessionEmail } });
  if (!me) {
    return NextResponse.json({ error: "no user" }, { status: 400 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = FriendAddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_friend_input" }, { status: 400 });
  }

  let friend: { id: string } | null = null;
  if ("token" in parsed.data) {
    let friendId: string;
    try {
      friendId = verifyInviteToken(parsed.data.token).userId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid_invite_token";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (friendId === me.id) return NextResponse.json({ error: "cannot_add_self" }, { status: 400 });
    friend = await prisma.user.findUnique({ where: { id: friendId }, select: { id: true } });
  } else {
    if (parsed.data.email === sessionEmail) {
      return NextResponse.json({ error: "cannot_add_self" }, { status: 400 });
    }

    friend = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
  }

  if (!friend) {
    return NextResponse.json({ error: "friend_not_found" }, { status: 404 });
  }

  const friendId = friend.id;

  await prisma.$transaction([
    prisma.friendship.upsert({
      where: { userId_friendId: { userId: me.id, friendId } },
      update: {},
      create: { userId: me.id, friendId },
    }),
    prisma.friendship.upsert({
      where: { userId_friendId: { userId: friendId, friendId: me.id } },
      update: {},
      create: { userId: friendId, friendId: me.id },
    }),
  ]);

  return NextResponse.json({ ok: true, friendId });
}
