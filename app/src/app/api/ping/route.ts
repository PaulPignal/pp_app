export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export async function GET() {
  return new Response(JSON.stringify({ ok: true, t: Date.now() }), {
    headers: { "content-type": "application/json" },
  });
}
