import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function withTimeout<T>(p: Promise<T>, ms = 6000) {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("DB timeout")), ms)),
  ]);
}

export async function GET(req: Request) {
  const t0 = Date.now();
  try {
    // Import dynamique de Prisma
    const prisma = await getPrisma();
    
    const url = new URL(req.url);
    const per = Math.min(Math.max(parseInt(url.searchParams.get("per") || "50", 10), 1), 100);
    const since = url.searchParams.get("since");
    const where: any = {};
    if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) where.createdAt = { gte: d };
    }

    // Log début
    console.log("[api/works] start", { per, where });

    const [total, items] = await withTimeout(Promise.all([
      prisma.work.count({ where }),
      prisma.work.findMany({ where, orderBy: { createdAt: "desc" }, take: per }),
    ]));

    console.log("[api/works] ok", { total, t: Date.now() - t0 });
    return NextResponse.json({ total, items }, { status: 200 });

  } catch (e: any) {
    console.error("[api/works] error", e?.message || e);
    return NextResponse.json({ error: e?.message || "server error" }, { status: 500 });
  }
}