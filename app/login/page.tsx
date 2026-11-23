"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: "err" | "ok"; m: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const sb = supabaseBrowser();
    if (mode === "in") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setMsg({ t: "err", m: error.message });
      router.replace("/"); router.refresh();
    } else {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
      setBusy(false);
      if (error) return setMsg({ t: "err", m: error.message });
      if (data.session) { router.replace("/"); router.refresh(); }
      else setMsg({ t: "ok", m: "Check your inbox to confirm your email, then sign in." });
    }
  }

  return (
    <div className="mx-auto grid min-h-[80vh] max-w-5xl items-center gap-12 md:grid-cols-2">
      <div>
        <p className="font-serif text-2xl tracking-[0.3em]">SWARA</p>
        <h1 className="h1 mt-8">Your voice.<br />Your face.<br /><em>Every vlog.</em></h1>
        <p className="mt-6 max-w-md text-muted">
          Record a minute of yourself speaking, add one photo, and turn any script into a lip-synced talking-head video — without
          setting up a camera.
        </p>
        <ol className="mt-8 space-y-2 text-sm text-ink/80">
          <li>01 · Clone your voice from a short sample</li>
          <li>02 · Add a portrait photo as your avatar</li>
          <li>03 · Write the script, render the vlog</li>
        </ol>
      </div>
      <form onSubmit={submit} className="card space-y-5">
        <div className="flex gap-2">
          {(["in", "up"] as const).map((m) => (
            <button type="button" key={m} onClick={() => setMode(m)}
              className={`rounded-full px-4 py-2 text-sm ${mode === m ? "bg-ink text-paper" : "text-muted"}`}>
              {m === "in" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "in" ? "current-password" : "new-password"} />
        </div>
        {msg && <p className={`text-sm ${msg.t === "err" ? "text-accent" : "text-emerald-700"}`}>{msg.m}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}</button>
      </form>
    </div>
  );
}
