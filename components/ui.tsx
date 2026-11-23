export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    done: "bg-emerald-100 text-emerald-800", ready: "bg-emerald-100 text-emerald-800",
    failed: "bg-red-100 text-red-800",
    voicing: "bg-amber-100 text-amber-800", animating: "bg-amber-100 text-amber-800", pending: "bg-amber-100 text-amber-800", queued: "bg-amber-100 text-amber-800",
  };
  const label: Record<string, string> = { voicing: "Voicing", animating: "Rendering", done: "Ready", ready: "Ready", failed: "Failed", pending: "Cloning", queued: "Queued" };
  return <span className={`pill ${map[status] ?? "bg-sand text-ink"}`}>{label[status] ?? status}</span>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-3 py-12">
      <p className="font-serif text-2xl">{title}</p>
      <p className="max-w-lg text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}

export function PageHead({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="label">{kicker}</p>
        <h1 className="h1">{title}</h1>
      </div>
      {children}
    </div>
  );
}
