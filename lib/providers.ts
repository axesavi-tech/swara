import "server-only";

const EL = "https://api.elevenlabs.io/v1";
const elKey = () => {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ElevenLabs is not configured (ELEVENLABS_API_KEY missing).");
  return k;
};

async function fail(r: Response, who: string): Promise<never> {
  let msg = `${r.status}`;
  try {
    const j = await r.json();
    msg = j?.detail?.message || j?.detail?.status || j?.detail || j?.message || j?.error || JSON.stringify(j);
  } catch {
    try { msg = await r.text(); } catch {}
  }
  throw new Error(`${who}: ${typeof msg === "string" ? msg.slice(0, 300) : JSON.stringify(msg).slice(0, 300)}`);
}

/* ---------------- Voice: ElevenLabs instant voice clone ---------------- */

export async function cloneVoice(name: string, samples: { blob: Blob; filename: string }[], description: string) {
  const fd = new FormData();
  fd.append("name", name);
  fd.append("description", description);
  fd.append("remove_background_noise", "true");
  for (const s of samples) fd.append("files", s.blob, s.filename);
  const r = await fetch(`${EL}/voices/add`, { method: "POST", headers: { "xi-api-key": elKey() }, body: fd });
  if (!r.ok) await fail(r, "ElevenLabs voice cloning");
  const j = (await r.json()) as { voice_id: string; requires_verification?: boolean };
  return j;
}

export async function deleteVoice(voiceId: string) {
  const r = await fetch(`${EL}/voices/${voiceId}`, { method: "DELETE", headers: { "xi-api-key": elKey() } });
  if (!r.ok && r.status !== 404) await fail(r, "ElevenLabs delete voice");
}

export type VoiceStyle = { stability: number; similarity: number; style: number; speed: number };

/** Split a long script at sentence boundaries into chunks the TTS model handles comfortably. */
export function chunkScript(text: string, max = 2400) {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length <= max) return [clean];
  const parts = clean.match(/[^.!?।\n]+[.!?।]*\s*|\n+/g) ?? [clean];
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > max && cur) { out.push(cur.trim()); cur = ""; }
    if (p.length > max) { for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max)); continue; }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export async function speak(voiceId: string, text: string, style: VoiceStyle, opts: { previous?: string; next?: string } = {}) {
  const model = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  const r = await fetch(`${EL}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": elKey(), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: model,
      previous_text: opts.previous || undefined,
      next_text: opts.next || undefined,
      voice_settings: {
        stability: style.stability,
        similarity_boost: style.similarity,
        style: style.style,
        use_speaker_boost: true,
        speed: style.speed,
      },
    }),
  });
  if (!r.ok) await fail(r, "ElevenLabs speech");
  return new Uint8Array(await r.arrayBuffer());
}

export async function speakScript(voiceId: string, script: string, style: VoiceStyle) {
  const chunks = chunkScript(script);
  const bufs: Uint8Array[] = [];
  for (let i = 0; i < chunks.length; i++) {
    bufs.push(await speak(voiceId, chunks[i], style, { previous: chunks[i - 1]?.slice(-400), next: chunks[i + 1]?.slice(0, 400) }));
  }
  const total = bufs.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of bufs) { out.set(b, o); o += b.length; }
  return out; // MP3 frames concatenate cleanly
}

/* ---------------- Avatar: photo + audio -> lip-synced video ---------------- */

export type AvatarProvider = "fal" | "did";
export function avatarProvider(): AvatarProvider {
  const p = (process.env.AVATAR_PROVIDER || "").toLowerCase();
  if (p === "did" || p === "fal") return p;
  return process.env.FAL_KEY ? "fal" : "did";
}
export function avatarConfigured() {
  const p = avatarProvider();
  return p === "fal" ? !!process.env.FAL_KEY : !!process.env.DID_API_KEY;
}

const FAL_MODEL = () => process.env.FAL_AVATAR_MODEL || "heygen/avatar-6/image-to-video";
const didAuth = () => {
  const k = process.env.DID_API_KEY;
  if (!k) throw new Error("D-ID is not configured (DID_API_KEY missing).");
  return k.includes(":") ? `Basic ${Buffer.from(k).toString("base64")}` : `Basic ${k}`;
};

export type Job = { provider: AvatarProvider; id: string; statusUrl?: string; responseUrl?: string };

export async function startAvatar(imageUrl: string, audioUrl: string, motion?: string): Promise<Job> {
  const p = avatarProvider();
  if (p === "fal") {
    const key = process.env.FAL_KEY;
    if (!key) throw new Error("fal is not configured (FAL_KEY missing).");
    const r = await fetch(`https://queue.fal.run/${FAL_MODEL()}`, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        audio_url: audioUrl,
        resolution: "1080p",
        ...(motion ? { motion_prompt: motion } : {}),
      }),
    });
    if (!r.ok) await fail(r, "Avatar (fal) submit");
    const j = await r.json();
    return { provider: "fal", id: j.request_id, statusUrl: j.status_url, responseUrl: j.response_url };
  }
  const r = await fetch("https://api.d-id.com/talks", {
    method: "POST",
    headers: { Authorization: didAuth(), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      source_url: imageUrl,
      script: { type: "audio", audio_url: audioUrl },
      config: { stitch: true, result_format: "mp4" },
    }),
  });
  if (!r.ok) await fail(r, "Avatar (D-ID) submit");
  const j = await r.json();
  return { provider: "did", id: j.id };
}

export type JobState = { state: "running" } | { state: "done"; videoUrl: string } | { state: "failed"; error: string };

export async function pollAvatar(job: Job): Promise<JobState> {
  if (job.provider === "fal") {
    const key = process.env.FAL_KEY!;
    const statusUrl = job.statusUrl || `https://queue.fal.run/${FAL_MODEL()}/requests/${job.id}/status`;
    const s = await fetch(statusUrl, { headers: { Authorization: `Key ${key}` }, cache: "no-store" });
    if (!s.ok) await fail(s, "Avatar (fal) status");
    const sj = await s.json();
    if (sj.status === "IN_QUEUE" || sj.status === "IN_PROGRESS") return { state: "running" };
    const responseUrl = job.responseUrl || `https://queue.fal.run/${FAL_MODEL()}/requests/${job.id}`;
    const r = await fetch(responseUrl, { headers: { Authorization: `Key ${key}` }, cache: "no-store" });
    if (!r.ok) {
      let e = `fal returned ${r.status}`;
      try { const j = await r.json(); e = j?.detail?.[0]?.msg || j?.detail || j?.error || e; } catch {}
      return { state: "failed", error: String(e).slice(0, 300) };
    }
    const rj = await r.json();
    const url = rj?.video?.url;
    return url ? { state: "done", videoUrl: url } : { state: "failed", error: "Avatar finished without a video." };
  }
  const r = await fetch(`https://api.d-id.com/talks/${job.id}`, { headers: { Authorization: didAuth() }, cache: "no-store" });
  if (!r.ok) await fail(r, "Avatar (D-ID) status");
  const j = await r.json();
  if (j.status === "done" && j.result_url) return { state: "done", videoUrl: j.result_url };
  if (j.status === "error" || j.status === "rejected") return { state: "failed", error: j?.error?.description || j?.error?.kind || "D-ID could not render this video." };
  return { state: "running" };
}
