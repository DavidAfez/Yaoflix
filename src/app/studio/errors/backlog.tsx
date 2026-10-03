"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { purgeResolved, resolveError } from "../actions";

type Row = {
  id: number;
  source: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
  resolved: boolean;
};

const SOURCES = ["server", "client", "player", "worker", "mail", "whatsapp"];
const tone: Record<string, string> = {
  server: "bg-coral",
  worker: "bg-coral",
  player: "bg-ice",
  client: "bg-bone",
  mail: "bg-lime",
  whatsapp: "bg-lime",
};
const ago = (iso: string) => {
  const m = (Date.now() - new Date(iso).getTime()) / 60_000;
  return m < 60 ? `${Math.floor(m)}m` : m < 2880 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}j`;
};

export function Backlog({ rows, view, source, counts, canResolve, canPurge }: { rows: Row[]; view: string; source: string; counts: Record<string, number>; canResolve: boolean; canPurge: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [, start] = useTransition();
  const href = (v: string, s: string) => `/studio/errors?view=${v}${s ? `&source=${s}` : ""}`;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline gap-4">
        <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-6xl">Erreurs</h1>
        <span className="font-mono text-coral">{total}</span>
        <div className="ml-auto flex gap-6 text-sm">
          <Link href={href("open", source)} className={view === "open" ? "text-bone" : "text-dim hover:text-bone"}>Ouvertes</Link>
          <Link href={href("done", source)} className={view === "done" ? "text-bone" : "text-dim hover:text-bone"}>Résolues</Link>
          {canPurge && view === "done" && (
            <button onClick={() => confirm("Purger ?") && start(() => purgeResolved())} className="text-coral">Purger</button>
          )}
        </div>
      </div>

      <div className="scrollbar-none mb-6 flex gap-2 overflow-x-auto">
        <Link href={href(view, "")} className={`shrink-0 border px-3 py-1.5 font-mono text-xs uppercase ${!source ? "border-lime text-lime" : "border-line text-dim"}`}>Tout</Link>
        {SOURCES.map((s) => (
          <Link key={s} href={href(view, s)} className={`flex shrink-0 items-center gap-2 border px-3 py-1.5 font-mono text-xs uppercase ${source === s ? "border-lime text-lime" : "border-line text-dim hover:text-bone"}`}>
            <span className={`size-1.5 ${tone[s]}`} />
            {s}
            {counts[s] ? <span className="text-bone">{counts[s]}</span> : null}
          </Link>
        ))}
      </div>

      {rows.length === 0 && <p className="py-24 text-center font-display text-4xl text-bone/15">Calme plat.</p>}
      <ul className="divide-y divide-line border-y border-line">
        <AnimatePresence initial={false}>
          {rows
            .filter((r) => !gone.has(r.id))
            .map((r) => (
              <motion.li key={r.id} layout exit={{ opacity: 0, x: 60 }}>
                <div className="flex items-start gap-4 py-3">
                  <span className={`mt-1.5 size-2 shrink-0 ${tone[r.source] ?? "bg-dim"}`} />
                  <button onClick={() => setOpen(open === r.id ? null : r.id)} className="min-w-0 flex-1 text-left">
                    <p className="truncate font-mono text-sm">{r.message}</p>
                    <p className="mt-0.5 flex gap-3 font-mono text-[11px] uppercase text-dim">
                      <span>{r.source}</span>
                      <span>{ago(r.lastSeen)}</span>
                      <span>depuis {ago(r.firstSeen)}</span>
                    </p>
                  </button>
                  <span className="font-display text-xl tabular-nums">×{r.count}</span>
                  {canResolve && !r.resolved && (
                    <button
                      onClick={() => {
                        setGone(new Set(gone).add(r.id));
                        start(() => resolveError(r.id));
                      }}
                      aria-label="Résolu"
                      title="Résolu"
                      className="grid size-9 shrink-0 place-items-center border border-line hover:border-lime hover:text-lime"
                    >
                      <Check size={15} />
                    </button>
                  )}
                </div>
                <AnimatePresence>
                  {open === r.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <pre className="mb-4 ml-6 max-h-80 overflow-auto border-l-2 border-coral bg-ink-2 p-4 font-mono text-[11px] leading-relaxed text-bone/80">
                        {r.stack}
                        {r.context && Object.keys(r.context).length > 0 ? `\n\n${JSON.stringify(r.context, null, 2)}` : ""}
                      </pre>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
