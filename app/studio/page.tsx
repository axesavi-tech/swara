"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PageHead } from "@/components/ui";

type Voice = { id: string; name: string };
type Avatar = { id: string; name: string; photo_path: string; url?: string };

const PRESETS = {
  Natural: { stability: 0.5, similarity: 0.8, style: 0.15, speed: 1 },
  Energetic: { stability: 0.35, similarity: 0.8, style: 0.45, speed: 1.08 },
  Calm: { stability: 0.7, similarity: 0.85, style: 0.05, speed: 0.94 },
};

export default function Studio() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [avatarId, setAvatarId] = useState<string>("");
  const [preset, setPreset] = useState<keyof typeof PRESETS>("Natural");
  const [motion, setMotion] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: a }] = await Promise.all([
        sb.from("voices").select("id,name").eq("status", "ready").order("created_at", { ascending: false }),
        sb.from("avatars").select("id,name,photo_path").order("created_at", { ascending: false }),
      ]);
      setVoices(v ?? []); if (v?.[0]) setVoiceId(v[0].id);
      const signed = await Promise.all((a ?? []).map(async (x) => ({ ...x, url: (await sb.storage.from("photos").createSignedUrl(x.photo_path, 3600)).data?.signedUrl })));
      setAvatars(signed); if (signed[0]) setAvatarId(signed[0].id);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const words = useMemo(() => script.trim().split(/\s+/).filter(Boolean).length, [script]);
  const seconds = Math.round((words / 150) * 60 / PRESETS[preset].speed);

  async function preview() {
    setErr(null); setPreviewing(true);
    const text = script.trim().slice(0, 240) || "Hi everyone, welcome back to the channel. Here's what I've been up to this week.";
    const r = await fetch("/api/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceId, text, style: PRESETS[preset] }) });
    setPreviewing(false);
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).error || "Preview failed.");
    new Audio(URL.createObjectURL(await r.blob())).play();
  }

  async function render() {
    setErr(null);
    if (!voiceId) return setErr("Clone a voice first.");
    if (!script.trim()) return setErr("Write your script.");
    setBusy(true);
    const r = await fetch("/api/vlogs", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || script.trim().split(/[.!?\n]/)[0].slice(0, 80), script, voiceId, avatarId: avatarId || null, motion, style: PRESETS[preset] }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (j.id) router.push(`/vlogs/${j.id}`);
    else setErr(j.error || "Could not start the render.");
  }

  if (!voices.length)
    return (
      <>
        <PageHead kicker="Studio" title="New vlog" />
        <div className="card"><p className="text-sm">You need a cloned voice first. <Link href="/voices" className="underline">Clone your voice →</Link></p></div>
      </>
    );

  return (
    <>
      <PageHead kicker="Studio" title="New vlog" />
      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <section className="card space-y-5">
          <div>
            <label className="label">Title</label>
            <input className="input" placeholder="e.g. Why I quit chasing perfect products" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label className="label">Script</label>
              <span className="text-xs text-muted">{words} words · ~{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} · {script.length}/8000</span>
            </div>
            <textarea className="input min-h-[380px] font-serif text-lg leading-relaxed" maxLength={8000}
              placeholder={"Write it the way you'd say it.\n\nShort sentences read best. Use commas and full stops for natural pauses, and new paragraphs for longer breaths. Hindi, English and Hinglish all work."}
              value={script} onChange={(e) => setScript(e.target.value)} />
          </div>
        </section>

        <aside className="space-y-5">
          <div className="card space-y-4">
            <div>
              <label className="label">Voice</label>
              <select className="input" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Delivery</label>
              <div className="flex gap-2">
                {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((p) => (
                  <button key={p} onClick={() => setPreset(p)} className={`rounded-full px-4 py-2 text-sm ${preset === p ? "bg-ink text-paper" : "border border-line"}`}>{p}</button>
                ))}
              </div>
            </div>
            <button className="btn-ghost w-full" onClick={preview} disabled={previewing}>{previewing ? "Generating…" : "▶ Preview first lines"}</button>
          </div>

          <div className="card space-y-4">
            <label className="label">Avatar</label>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setAvatarId("")}
                className={`flex aspect-[9/16] items-center justify-center rounded-xl border text-xs ${!avatarId ? "border-ink bg-sand" : "border-line"}`}>Voice only</button>
              {avatars.map((a) => (
                <button key={a.id} onClick={() => setAvatarId(a.id)}
                  className={`overflow-hidden rounded-xl border-2 ${avatarId === a.id ? "border-ink" : "border-transparent"}`}>
                  {a.url && <img src={a.url} alt={a.name} className="aspect-[9/16] w-full object-cover" />}
                </button>
              ))}
            </div>
            {!avatars.length && <p className="text-xs text-muted"><Link href="/avatars" className="underline">Add a photo</Link> to get a talking-head video.</p>}
            {avatarId && (
              <div>
                <label className="label">Motion direction (optional)</label>
                <input className="input" placeholder="e.g. warm, relaxed, occasional smile" value={motion} onChange={(e) => setMotion(e.target.value)} />
              </div>
            )}
          </div>

          {err && <p className="text-sm text-accent">{err}</p>}
          <button className="btn w-full py-4" disabled={busy} onClick={render}>
            {busy ? "Voicing your script…" : avatarId ? "Render vlog video" : "Render voice-over"}
          </button>
          <p className="text-xs text-muted">Voicing takes a few seconds per minute of script. Avatar videos usually take a few minutes; you can leave this page.</p>
        </aside>
      </div>
    </>
  );
}
