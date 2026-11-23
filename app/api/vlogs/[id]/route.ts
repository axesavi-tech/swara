import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/server";
import { pollAvatar, type AvatarProvider } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Returns the vlog with fresh signed URLs; advances an in-flight avatar render and stores the finished video. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { sb, user } = auth;
  const { id } = await ctx.params;
  let { data: v } = await sb.from("vlogs").select("*").eq("id", id).single();
  if (!v) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (v.status === "animating" && v.job_id && v.provider) {
    try {
      const st = await pollAvatar({ provider: v.provider as AvatarProvider, id: v.job_id, statusUrl: v.job_status_url ?? undefined, responseUrl: v.job_response_url ?? undefined });
      if (st.state === "done") {
        const r = await fetch(st.videoUrl);
        if (!r.ok) throw new Error(`Could not download the finished video (${r.status}).`);
        const buf = new Uint8Array(await r.arrayBuffer());
        const videoPath = `${user.id}/${v.id}.mp4`;
        const up = await sb.storage.from("videos").upload(videoPath, buf, { contentType: "video/mp4", upsert: true });
        if (up.error) throw new Error(`Could not save the video: ${up.error.message}`);
        ({ data: v } = await sb.from("vlogs").update({ video_path: videoPath, status: "done", updated_at: new Date().toISOString() }).eq("id", id).select().single());
      } else if (st.state === "failed") {
        ({ data: v } = await sb.from("vlogs").update({ status: "failed", error: st.error, updated_at: new Date().toISOString() }).eq("id", id).select().single());
      }
    } catch (e) {
      // transient: keep animating, surface the message
      return NextResponse.json({ vlog: v, warning: e instanceof Error ? e.message : "Status check failed." });
    }
  }

  const urls: { audio?: string; video?: string } = {};
  if (v!.audio_path) urls.audio = (await sb.storage.from("audio").createSignedUrl(v!.audio_path, 3600, { download: false })).data?.signedUrl;
  if (v!.video_path) urls.video = (await sb.storage.from("videos").createSignedUrl(v!.video_path, 3600)).data?.signedUrl;
  return NextResponse.json({ vlog: v, urls });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await ctx.params;
  const { data: v } = await auth.sb.from("vlogs").select("audio_path,video_path").eq("id", id).single();
  if (!v) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (v.audio_path) await auth.sb.storage.from("audio").remove([v.audio_path]);
  if (v.video_path) await auth.sb.storage.from("videos").remove([v.video_path]);
  await auth.sb.from("vlogs").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
