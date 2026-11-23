"use client";
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StatusPill } from "@/components/ui";

type Vlog = { id: string; title: string; script: string; status: string; error: string | null; avatar_id: string | null; created_at: string };

export default function VlogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [v, setV] = useState<Vlog | null>(null);
  const [urls, setUrls] = useState<{ audio?: string; video?: string }>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    const r = await fetch(`/api/vlogs/${id}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (j.vlog) setV(j.vlog);
    if (j.urls) setUrls(j.urls);
    setWarning(j.warning ?? null);
    if (j.vlog && ["voicing", "animating", "queued"].includes(j.vlog.status)) t.current = setTimeout(load, 8000);
  }
  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (t.current) clearTimeout(t.current); clearInterval(tick); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    if (!confirm("Delete this vlog and its files?")) return;
    await fetch(`/api/vlogs/${id}`, { method: "DELETE" });
    router.replace("/"); router.refresh();
  }

  if (!v) return <p className="text-muted">Loading…</p>;
  const working = ["voicing", "animating", "queued"].includes(v.status);
  const secs = Math.floor((now - started) / 1000);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div>
        {urls.video ? (
          <video src={urls.video} controls playsInline className="aspect-[9/16] w-full rounded-2xl bg-black object-contain" />
        ) : (
          <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-4 rounded-2xl bg-ink p-8 text-center text-paper">
            {working ? (
              <>
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-paper/20 border-t-paper" />
                <p className="font-serif text-2xl">{v.status === "voicing" ? "Voicing your script" : "Animating your avatar"}</p>
                <p className="text-xs text-paper/60">Usually a few minutes · checking every 8 s · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</p>
              </>
            ) : v.status === "failed" ? (
              <p className="font-serif text-2xl">This render failed</p>
            ) : (
              <p className="font-serif text-2xl">Voice-over ready</p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3"><StatusPill status={v.status} /><span className="text-xs text-muted">{new Date(v.created_at).toLocaleString("en-IN")}</span></div>
        <h1 className="h1">{v.title}</h1>
        {v.error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{v.error}</p>}
        {warning && working && <p className="text-xs text-amber-700">{warning}</p>}

        {urls.audio && (
          <div className="card space-y-3">
            <p className="label">Voice-over</p>
            <audio src={urls.audio} controls className="w-full" />
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {urls.video && <a className="btn" href={urls.video} download={`${v.title}.mp4`}>Download video</a>}
          {urls.audio && <a className="btn-ghost" href={urls.audio} download={`${v.title}.mp3`}>Download audio</a>}
          <Link className="btn-ghost" href="/studio">New vlog</Link>
          <button className="btn-ghost text-accent" onClick={del}>Delete</button>
        </div>

        <div className="card">
          <p className="label">Script</p>
          <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{v.script}</p>
        </div>
      </div>
    </div>
  );
}
