import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { cloneVoice } from "@/lib/providers";
import { VOICE_CONSENT } from "@/lib/consent";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Body: { name, samplePaths: string[], consentName, consent: true } — samples already uploaded to the private "samples" bucket. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { sb, user } = auth;
  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").trim().slice(0, 80);
  const consentName = String(body?.consentName || "").trim().slice(0, 120);
  const paths: string[] = Array.isArray(body?.samplePaths) ? body.samplePaths.slice(0, 10) : [];
  if (!name || !paths.length) return NextResponse.json({ error: "Add a name and at least one voice sample." }, { status: 400 });
  if (body?.consent !== true || consentName.length < 2)
    return NextResponse.json({ error: "Confirm consent and type your full name to continue." }, { status: 400 });
  if (paths.some((p) => !p.startsWith(`${user.id}/`))) return NextResponse.json({ error: "Invalid sample." }, { status: 400 });
  if (!process.env.ELEVENLABS_API_KEY) {
    await sb.storage.from("samples").remove(paths);
    return NextResponse.json({ error: "Voice cloning isn't switched on yet: the ElevenLabs API key hasn't been added to the app." }, { status: 503 });
  }

  const { data: row, error } = await sb
    .from("voices")
    .insert({ name, sample_path: paths.join("|"), consent_name: consentName, consent_statement: VOICE_CONSENT })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  try {
    const samples = [];
    for (const p of paths) {
      const { data, error: e } = await sb.storage.from("samples").download(p);
      if (e || !data) throw new Error("Could not read the uploaded sample.");
      samples.push({ blob: data, filename: p.split("/").pop() || "sample" });
    }
    const v = await cloneVoice(name, samples, `Swara voice for ${consentName}. Consent recorded ${new Date().toISOString()}.`);
    if (v.requires_verification) {
      await sb.from("voices").update({ status: "failed", error: "ElevenLabs asks to verify this voice before it can be used. Verify it in your ElevenLabs account, or use a sample of your own voice.", provider_voice_id: v.voice_id }).eq("id", row.id);
      return NextResponse.json({ error: "This voice needs verification in ElevenLabs before it can be used." }, { status: 409 });
    }
    const { data: done } = await sb.from("voices").update({ status: "ready", provider_voice_id: v.voice_id }).eq("id", row.id).select().single();
    return NextResponse.json({ voice: done });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Voice cloning failed.";
    await sb.from("voices").update({ status: "failed", error: msg }).eq("id", row.id);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
