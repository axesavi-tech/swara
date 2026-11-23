"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { VOICE_CONSENT } from "@/lib/consent";
import { Empty, PageHead, StatusPill } from "@/components/ui";

type Voice = { id: string; name: string; status: string; error: string | null; created_at: string; consent_name: string };
type Sample = { file: Blob; name: string; seconds?: number; url: string };

const READ_ALOUD =
  "Hi, I'm recording this so my voice can narrate my vlogs. I'll speak naturally, the way I talk to friends — sometimes quick, sometimes slow, " +
  "with a little laughter now and then. Today I want to share what I've been working on, why it matters to me, and what I've learned along the way. " +
  "Some days go exactly to plan; most don't. That's the part worth talking about.";

export default function Voices() {
  const sb = supabaseBrowser();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [name, setName] = useState("My voice");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [consent, setConsent] = useState(false);
  const [consentName, setConsentName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    const { data } = await sb.from("voices").select("id,name,status,error,created_at,consent_name").order("created_at", { ascending: false });
    setVoices(data ?? []);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const total = samples.reduce((n, s) => n + (s.seconds ?? 0), 0);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const next: Sample[] = [];
    for (const f of Array.from(list).slice(0, 10 - samples.length)) {
      if (f.size > 25 * 1024 * 1024) { setErr(`${f.name} is larger than 25 MB.`); continue; }
      const url = URL.createObjectURL(f);
      next.push({ file: f, name: f.name, url, seconds: await duration(url) });
    }
    setSamples((s) => [...s, ...next]);
  }

  async function startRec() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/mp4";
      const r = new MediaRecorder(stream, { mimeType: mime });
      const chunks: BlobPart[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = mime.startsWith("audio/webm") ? "audio/webm" : "audio/mp4";
        const blob = new Blob(chunks, { type });
        const url = URL.createObjectURL(blob);
        setSamples((s) => [...s, { file: blob, name: `recording-${s.length + 1}.${type === "audio/webm" ? "webm" : "m4a"}`, url, seconds: elapsedRef.current }]);
      };
      r.start();
      setRec(r); setElapsed(0); elapsedRef.current = 0;
      timer.current = setInterval(() => { elapsedRef.current += 1; setElapsed(elapsedRef.current); }, 1000);
    } catch {
      setErr("Microphone access was blocked. Allow it in your browser, or upload a recording instead.");
    }
  }
  const elapsedRef = useRef(0);
  function stopRec() { rec?.stop(); setRec(null); if (timer.current) clearInterval(timer.current); }

  async function create() {
    setErr(null);
    if (!samples.length) return setErr("Add at least one recording.");
    if (!consent || consentName.trim().length < 2) return setErr("Tick the consent box and type your full name.");
    setBusy("Uploading samples…");
    const { data: u } = await sb.auth.getUser();
    const uid = u.user!.id;
    const paths: string[] = [];
    for (const s of samples) {
      const ext = s.name.split(".").pop() || "webm";
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("samples").upload(path, s.file, { contentType: s.file.type || "audio/webm" });
      if (error) { setBusy(null); return setErr(`Upload failed: ${error.message}`); }
      paths.push(path);
    }
    setBusy("Cloning your voice… this takes about 20 seconds.");
    const r = await fetch("/api/voices", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, samplePaths: paths, consent, consentName }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) setErr(j.error || "Cloning failed.");
    else { setSamples([]); setConsent(false); }
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this voice? It is removed from ElevenLabs too.")) return;
    const r = await fetch(`/api/voices/${id}`, { method: "DELETE" });
    if (!r.ok) alert((await r.json().catch(() => ({}))).error || "Could not delete.");
    load();
  }

  return (
    <>
      <PageHead kicker="Step 1" title="Your voices" />
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <section className="card space-y-6">
          <div>
            <p className="font-serif text-2xl">Clone a voice</p>
            <p className="mt-1 text-sm text-muted">One to three minutes of clean, natural speech works best. Quiet room, phone or laptop mic is fine.</p>
          </div>
          <div>
            <label className="label">Voice name</label>
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="rounded-xl bg-sand/60 p-4">
            <p className="label">Read this aloud (or just talk naturally)</p>
            <p className="font-serif text-lg leading-relaxed">{READ_ALOUD}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {rec ? (
              <button className="btn bg-accent hover:bg-accent" onClick={stopRec}>■ Stop · {fmt(elapsed)}</button>
            ) : (
              <button className="btn" onClick={startRec}>● Record</button>
            )}
            <label className="btn-ghost cursor-pointer">
              Upload audio
              <input type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <span className={`text-sm ${total >= 60 ? "text-emerald-700" : "text-muted"}`}>{fmt(total)} recorded {total < 60 && "· aim for 1 min+"}</span>
          </div>

          {!!samples.length && (
            <ul className="space-y-2">
              {samples.map((s, i) => (
                <li key={s.url} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
                  <audio src={s.url} controls className="h-9 flex-1" />
                  <span className="w-12 text-right text-xs text-muted">{s.seconds ? fmt(s.seconds) : ""}</span>
                  <button className="text-xs text-muted hover:text-accent" onClick={() => setSamples((x) => x.filter((_, k) => k !== i))}>Remove</button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 rounded-xl border border-line p-4">
            <label className="flex gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{VOICE_CONSENT}</span>
            </label>
            <input className="input" placeholder="Type your full name to sign" value={consentName} onChange={(e) => setConsentName(e.target.value)} />
          </div>

          {err && <p className="text-sm text-accent">{err}</p>}
          <button className="btn" disabled={!!busy || !!rec} onClick={create}>{busy ?? "Clone voice"}</button>
        </section>

        <section className="space-y-3">
          {!voices.length ? (
            <Empty title="No voices yet" body="Your cloned voices appear here. Each one is private to your account." />
          ) : voices.map((v) => (
            <div key={v.id} className="card flex items-center gap-4 py-4">
              <div className="flex-1">
                <p className="font-medium">{v.name}</p>
                <p className="text-xs text-muted">Consent signed by {v.consent_name} · {new Date(v.created_at).toLocaleDateString("en-IN")}</p>
                {v.error && <p className="mt-1 text-xs text-accent">{v.error}</p>}
              </div>
              <StatusPill status={v.status} />
              <button className="text-xs text-muted hover:text-accent" onClick={() => remove(v.id)}>Delete</button>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function fmt(s: number) { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function duration(url: string) {
  return new Promise<number | undefined>((res) => {
    const a = new Audio(); a.preload = "metadata"; a.src = url;
    a.onloadedmetadata = () => res(Number.isFinite(a.duration) ? a.duration : undefined);
    a.onerror = () => res(undefined);
  });
}
