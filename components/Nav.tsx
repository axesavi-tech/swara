"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const LINKS = [
  { href: "/", label: "Library" },
  { href: "/studio", label: "New vlog" },
  { href: "/voices", label: "Voices" },
  { href: "/avatars", label: "Avatars" },
];

export default function Nav({ email }: { email: string }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-4 md:px-8">
        <Link href="/" className="font-serif text-2xl tracking-[0.18em]">SWARA</Link>
        <nav className="flex flex-1 gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm transition ${on ? "bg-ink text-paper" : "text-ink/70 hover:text-ink"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <button
          className="hidden text-xs text-muted hover:text-ink md:block"
          title={email}
          onClick={async () => { await supabaseBrowser().auth.signOut(); router.replace("/login"); router.refresh(); }}>
          Sign out
        </button>
      </div>
    </header>
  );
}
