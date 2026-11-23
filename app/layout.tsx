import "./globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import Nav from "@/components/Nav";
import { supabaseServer } from "@/lib/supabase/server";

const serif = localFont({
  src: [{ path: "./fonts/Cormorant.woff2", style: "normal" }, { path: "./fonts/Cormorant-Italic.woff2", style: "italic" }],
  variable: "--font-serif", display: "swap",
});
const sans = localFont({
  src: [{ path: "./fonts/Inter-Regular.woff2", weight: "400" }, { path: "./fonts/Inter-Medium.woff2", weight: "500" }, { path: "./fonts/Inter-SemiBold.woff2", weight: "600" }],
  variable: "--font-sans", display: "swap",
});

export const metadata: Metadata = {
  title: "Swara — your voice, your avatar, your vlog",
  description: "Clone your own voice from a short sample, pair it with a photo avatar and turn scripts into vlog-ready videos.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        {data.user && <Nav email={data.user.email ?? ""} />}
        <main className="mx-auto max-w-6xl px-5 pb-24 pt-8 md:px-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-5 pb-10 text-xs text-muted md:px-8">
          Swara only clones voices and faces with recorded consent. Cloned voices are created with ElevenLabs; avatar videos with
          your configured avatar provider.
        </footer>
      </body>
    </html>
  );
}
