// src/app/api/works/route.ts
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function withTimeout<T>(p: Promise<T>, ms = 6000) {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("DB timeout")), ms))]);
}

export async function GET(req: Request) {
  const t0 = Date.now();
  try {
    const prisma = await getPrisma();
    const url = new URL(req.url);
    const per = Math.min(Math.max(parseInt(url.searchParams.get("per") || "100", 10), 1), 200);

    const where: any = {};
    const since = url.searchParams.get("since");
    if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) where.createdAt = { gte: d };
    }

    // 🔐 filtre par user: exclure toute Reaction (LIKE/DISLIKE/SEEN)
    const session = await auth();
    const email = session?.user?.email ?? null;
    if (email) {
      const me = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (me) {
        const reacted = await prisma.reaction.findMany({
          where: { userId: me.id },
          select: { workId: true },
        });
        const reactedIds = reacted.map(r => r.workId);
        if (reactedIds.length) where.id = { notIn: reactedIds };
      }
    }

    const [total, items] = await withTimeout(Promise.all([
      prisma.work.count({ where }),
      prisma.work.findMany({ where, orderBy: { createdAt: "desc" }, take: per }),
    ]));

    return NextResponse.json({ total, items }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "server error" }, { status: 500 });
  }
}