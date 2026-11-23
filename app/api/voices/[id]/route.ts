import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { deleteVoice } from "@/lib/providers";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await ctx.params;
  const { data: v } = await auth.sb.from("voices").select("*").eq("id", id).single();
  if (!v) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    if (v.provider_voice_id) await deleteVoice(v.provider_voice_id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not delete the cloned voice." }, { status: 502 });
  }
  const paths = String(v.sample_path || "").split("|").filter(Boolean);
  if (paths.length) await auth.sb.storage.from("samples").remove(paths);
  await auth.sb.from("voices").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
