"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PHOTO_CONSENT } from "@/lib/consent";
import { Empty, PageHead } from "@/components/ui";

type Avatar = { id: string; name: string; photo_path: string; created_at: string; url?: string };

export default function Avatars() {
  const sb = supabaseBrowser();
  const [list, setList] = useState<Avatar[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [name, setName] = useState("Me");
  const [consent, setConsent] = useState(false);
  const [consentName, setConsentName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const { data } = await sb.from("avatars").select("*").order("created_at", { ascending: false });
    const rows = data ?? [];
    const signed = await Promise.all(rows.map(async (a) => ({ ...a, url: (await sb.storage.from("photos").createSignedUrl(a.photo_path, 3600)).data?.signedUrl })));
    setList(signed);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(f: File | undefined) {
    setErr(null);
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return setErr("Use a JPG, PNG or WebP photo.");
    if (f.size > 10 * 1024 * 1024) return setErr("Keep the photo under 10 MB.");
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    setFile(f); setPreview(url);
  }

  async function save() {
    setErr(null);
    if (!file) return setErr("Choose a photo.");
    if (!consent || consentName.trim().length < 2) return setErr("Tick the consent box and type your full name.");
    setBusy(true);
    const { data: u } = await sb.auth.getUser();
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${u.user!.id}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from("photos").upload(path, file, { contentType: file.type });
    if (up.error) { setBusy(false); return setErr(up.error.message); }
    const { error } = await sb.from("avatars").insert({ name: name.trim() || "Avatar", photo_path: path, consent_name: consentName.trim(), consent_statement: PHOTO_CONSENT });
    setBusy(false);
    if (error) return setErr(error.message);
    setFile(null); setPreview(null); setConsent(false);
    load();
  }

  async function remove(a: Avatar) {
    if (!confirm("Delete this avatar photo?")) return;
    await sb.storage.from("photos").remove([a.photo_path]);
    await sb.from("avatars").delete().eq("id", a.id);
    load();
  }

  const portrait = dims ? dims.h / dims.w : 0;
  const warn = dims && (Math.min(dims.w, dims.h) < 512 ? "Low resolution — the video will look soft. Use at least 1080 px wide." :
    portrait < 1.3 ? "This photo is not vertical. For Reels and Shorts, use a 9:16 portrait photo." : null);

  return (
    <>
      <PageHead kicker="Step 2" title="Your avatars" />
      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <section className="card space-y-5">
          <p className="font-serif text-2xl">Add a photo</p>
          <ul className="space-y-1 text-sm text-muted">
            <li>· Face the camera, mouth closed, neutral expression</li>
            <li>· Even, soft light; nothing covering the face</li>
            <li>· Vertical (9:16) photo for Reels and Shorts, at least 1080 px wide</li>
          </ul>
          <label className="flex aspect-[9/16] max-h-[420px] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line bg-white">
            {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <span className="text-sm text-muted">Choose a portrait photo</span>}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {warn && <p className="text-xs text-amber-700">{warn}</p>}
          <div>
            <label className="label">Avatar name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-3 rounded-xl border border-line p-4">
            <label className="flex gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{PHOTO_CONSENT}</span>
            </label>
            <input className="input" placeholder="Type your full name to sign" value={consentName} onChange={(e) => setConsentName(e.target.value)} />
          </div>
          {err && <p className="text-sm text-accent">{err}</p>}
          <button className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save avatar"}</button>
        </section>

        <section>
          {!list.length ? (
            <Empty title="No avatars yet" body="Saved photos appear here, ready to pick in the studio." />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {list.map((a) => (
                <div key={a.id} className="group overflow-hidden rounded-2xl border border-line bg-white">
                  <div className="aspect-[9/16] bg-sand">{a.url && <img src={a.url} alt={a.name} className="h-full w-full object-cover" />}</div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm font-medium">{a.name}</span>
                    <button className="text-xs text-muted hover:text-accent" onClick={() => remove(a)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
