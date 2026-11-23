import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { speakScript, startAvatar, avatarConfigured } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Body: { title, script, voiceId, avatarId?, motion?, style } → voices the script, then starts the avatar render. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { sb, user } = auth;
  const b = await req.json().catch(() => null);
  const title = String(b?.title || "").trim().slice(0, 120) || "Untitled vlog";
  const script = String(b?.script || "").trim();
  if (!script) return NextResponse.json({ error: "Write a script first." }, { status: 400 });
  if (script.length > 8000) return NextResponse.json({ error: "Keep the script under 8,000 characters (about 9 minutes)." }, { status: 400 });

  const { data: voice } = await sb.from("voices").select("*").eq("id", b?.voiceId).single();
  if (!voice || voice.status !== "ready") return NextResponse.json({ error: "Choose a ready voice." }, { status: 400 });
  let avatar = null;
  if (b?.avatarId) {
    const { data } = await sb.from("avatars").select("*").eq("id", b.avatarId).single();
    if (!data) return NextResponse.json({ error: "Avatar not found." }, { status: 400 });
    if (!avatarConfigured()) return NextResponse.json({ error: "Avatar video isn't configured yet (add FAL_KEY or DID_API_KEY)." }, { status: 400 });
    avatar = data;
  }

  const { data: vlog, error } = await sb
    .from("vlogs")
    .insert({ title, script, voice_id: voice.id, avatar_id: avatar?.id ?? null, status: "voicing" })
    .select()
    .single();
  if (error || !vlog) return NextResponse.json({ error: error?.message || "Could not create the vlog." }, { status: 400 });

  const fail = async (msg: string) => {
    await sb.from("vlogs").update({ status: "failed", error: msg, updated_at: new Date().toISOString() }).eq("id", vlog.id);
    return NextResponse.json({ error: msg, id: vlog.id }, { status: 502 });
  };

  try {
    const s = b?.style || {};
    const clamp = (v: unknown, d: number, lo = 0, hi = 1) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    const audio = await speakScript(voice.provider_voice_id, script, {
      stability: clamp(s.stability, 0.5), similarity: clamp(s.similarity, 0.8), style: clamp(s.style, 0.15), speed: clamp(s.speed, 1, 0.7, 1.2),
    });
    const audioPath = `${user.id}/${vlog.id}.mp3`;
    const up = await sb.storage.from("audio").upload(audioPath, audio, { contentType: "audio/mpeg", upsert: true });
    if (up.error) return fail(`Could not save the voice-over: ${up.error.message}`);

    if (!avatar) {
      await sb.from("vlogs").update({ audio_path: audioPath, status: "done", updated_at: new Date().toISOString() }).eq("id", vlog.id);
      return NextResponse.json({ id: vlog.id });
    }

    const [{ data: a }, { data: p }] = await Promise.all([
      sb.storage.from("audio").createSignedUrl(audioPath, 60 * 60 * 6),
      sb.storage.from("photos").createSignedUrl(avatar.photo_path, 60 * 60 * 6),
    ]);
    if (!a?.signedUrl || !p?.signedUrl) return fail("Could not prepare files for the avatar renderer.");
    const job = await startAvatar(p.signedUrl, a.signedUrl, String(b?.motion || "").slice(0, 300) || undefined);
    await sb.from("vlogs").update({
      audio_path: audioPath, status: "animating", provider: job.provider, job_id: job.id,
      job_status_url: job.statusUrl ?? null, job_response_url: job.responseUrl ?? null, updated_at: new Date().toISOString(),
    }).eq("id", vlog.id);
    return NextResponse.json({ id: vlog.id });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Something went wrong.");
  }
}
