import { requireUser } from "@/lib/supabase/server";
import { speak } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Short spoken preview of a voice. Body: { voiceId, text, style } */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth) return Response.json({ error: "Please sign in." }, { status: 401 });
  const b = await req.json().catch(() => null);
  const text = String(b?.text || "").trim().slice(0, 300);
  if (!text) return Response.json({ error: "Type something to preview." }, { status: 400 });
  const { data: v } = await auth.sb.from("voices").select("provider_voice_id,status").eq("id", b?.voiceId).single();
  if (!v?.provider_voice_id || v.status !== "ready") return Response.json({ error: "That voice isn't ready." }, { status: 400 });
  try {
    const audio = await speak(v.provider_voice_id, text, {
      stability: num(b?.style?.stability, 0.5), similarity: num(b?.style?.similarity, 0.8),
      style: num(b?.style?.style, 0.15), speed: num(b?.style?.speed, 1, 0.7, 1.2),
    });
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Preview failed." }, { status: 502 });
  }
}
function num(v: unknown, d: number, lo = 0, hi = 1) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
}
