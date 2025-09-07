import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { auth } from "@/auth"


export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: "no user" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const friendId = searchParams.get("friendId");
  if (!friendId) return NextResponse.json({ error: "friendId required" }, { status: 400 });

  // Likes en commun
  const common = await prisma.like.findMany({
    where: { userId: { in: [me.id, friendId] } },
    include: { work: true },
  });

  const mySet = new Set(common.filter(l => l.userId === me.id).map(l => l.workId));
  const friendSet = new Set(common.filter(l => l.userId === friendId).map(l => l.workId));
  const intersectIds = [...mySet].filter(x => friendSet.has(x));

  const works = await prisma.work.findMany({ where: { id: { in: intersectIds } } });
  return NextResponse.json({ works });
}
