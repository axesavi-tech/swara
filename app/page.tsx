import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { Empty, PageHead, StatusPill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Library() {
  const sb = await supabaseServer();
  const [{ data: vlogs }, { count: voices }, { count: avatars }] = await Promise.all([
    sb.from("vlogs").select("id,title,status,created_at,avatar_id,script").order("created_at", { ascending: false }).limit(60),
    sb.from("voices").select("id", { count: "exact", head: true }).eq("status", "ready"),
    sb.from("avatars").select("id", { count: "exact", head: true }),
  ]);

  const setup = [
    { done: (voices ?? 0) > 0, label: "Clone your voice", href: "/voices" },
    { done: (avatars ?? 0) > 0, label: "Add your avatar photo", href: "/avatars" },
    { done: (vlogs?.length ?? 0) > 0, label: "Render your first vlog", href: "/studio" },
  ];

  return (
    <>
      <PageHead kicker="Library" title="Your vlogs">
        <Link href="/studio" className="btn">New vlog</Link>
      </PageHead>

      {setup.some((s) => !s.done) && (
        <div className="mb-10 grid gap-3 md:grid-cols-3">
          {setup.map((s, i) => (
            <Link key={s.label} href={s.href} className={`card flex items-center gap-4 py-5 transition hover:border-ink ${s.done ? "opacity-50" : ""}`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm ${s.done ? "bg-emerald-100 text-emerald-800" : "bg-ink text-paper"}`}>
                {s.done ? "✓" : i + 1}
              </span>
              <span className="text-sm font-medium">{s.label}</span>
            </Link>
          ))}
        </div>
      )}

      {!vlogs?.length ? (
        <Empty title="Nothing rendered yet" body="Once your voice is cloned, write a script in the studio and Swara will voice it — and animate your avatar if you pick one." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {vlogs.map((v) => (
            <Link key={v.id} href={`/vlogs/${v.id}`} className="card group flex flex-col gap-3 transition hover:border-ink">
              <div className="flex items-center justify-between">
                <StatusPill status={v.status} />
                <span className="text-xs text-muted">{v.avatar_id ? "Video" : "Voice-over"}</span>
              </div>
              <p className="font-serif text-2xl leading-tight">{v.title}</p>
              <p className="line-clamp-3 text-sm text-muted">{v.script}</p>
              <p className="mt-auto text-xs text-muted">{new Date(v.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
