"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { FileVideo, Pause, Play, RotateCcw, Search, Trash2, X, Captions } from "lucide-react";
import type { PosterData } from "@/components/poster";
import { Button, Dots } from "@/components/ui";
import { deleteMedia, retryMedia } from "../actions";

type MediaRow = {
  id: string;
  status: "UPLOADING" | "QUEUED" | "PROCESSING" | "READY" | "FAILED";
  progress: number;
  error: string | null;
  name: string;
  year: number | null;
  poster: string | null;
  heights: number[];
  audio: string[];
  subs: string[];
  duration: number | null;
  by: string | null;
  at: string;
};
type Picked = PosterData & { id: number };

const statusLabel = { UPLOADING: "Envoi", QUEUED: "File", PROCESSING: "Encodage", READY: "En ligne", FAILED: "Échec" };
const statusColor = { UPLOADING: "bg-ice", QUEUED: "bg-dim", PROCESSING: "bg-ice", READY: "bg-lime", FAILED: "bg-coral" };

const mb = (b: number) => (b / 1024 ** 2).toFixed(0);
const eta = (s: number) => (s > 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

export function Library({ media, preselect, canDelete }: { media: MediaRow[]; preselect: Picked | null; canDelete: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked | null>(preselect);
  const busy = media.some((m) => m.status === "QUEUED" || m.status === "PROCESSING");

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [busy, router]);

  return (
    <div className="grid gap-12 xl:grid-cols-[minmax(0,420px)_1fr]">
      <section>
        <h1 className="mb-6 font-display text-4xl font-extrabold tracking-tight md:text-6xl">Upload</h1>
        <AnimatePresence mode="wait">
          {picked ? (
            <Uploader key={picked.id} title={picked} onClose={() => setPicked(null)} onDone={() => router.refresh()} />
          ) : (
            <TitlePicker key="pick" onPick={setPicked} />
          )}
        </AnimatePresence>
      </section>

      <section>
        <ul className="divide-y divide-line border-y border-line">
          {media.map((m, i) => (
            <MediaLine key={m.id} m={m} i={i} canDelete={canDelete} />
          ))}
        </ul>
        {!media.length && <p className="py-20 text-center font-display text-3xl text-bone/15">Vide.</p>}
      </section>
    </div>
  );
}

function TitlePicker({ onPick }: { onPick: (p: Picked) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<(PosterData & { id?: number })[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) return setRes([]);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&ids=1`, { signal: ctl.signal }).catch(() => null);
      if (r?.ok) setRes(((await r.json()) as { results: PosterData[] }).results);
      setLoading(false);
    }, 280);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <label className="flex items-center gap-3 border-b border-line pb-3 focus-within:border-lime">
        <Search size={20} className="text-lime" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titre" className="w-full bg-transparent text-xl outline-none placeholder:text-bone/25" />
        {loading && <Dots />}
      </label>
      <ul className="mt-4 max-h-[60vh] overflow-y-auto">
        {res.map((r, i) => (
          <motion.li key={`${r.kind}${r.tmdbId}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}>
            <button
              onClick={async () => {
                const page = await fetch(`/api/titles/resolve?kind=${r.kind}&tmdb=${r.tmdbId}`).then((x) => x.json() as Promise<{ id: number }>);
                onPick({ ...r, id: page.id });
              }}
              className="flex w-full items-center gap-3 py-2 text-left hover:bg-ink-2"
            >
              <div className="h-14 w-10 shrink-0 bg-ink-3">
                {r.poster && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.poster} alt="" className="size-full object-cover" />
                )}
              </div>
              <span className="flex-1 truncate">{r.name}</span>
              <span className="font-mono text-xs text-dim">{r.year}</span>
              {r.ready && <span className="size-2 bg-lime" />}
            </button>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

function Uploader({ title, onClose, onDone }: { title: Picked; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [subs, setSubs] = useState<{ file: File; lang: string }[]>([]);
  const [sent, setSent] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [state, setState] = useState<"idle" | "up" | "paused" | "done" | "error">("idle");
  const [drag, setDrag] = useState(false);
  const paused = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!file) return;
    paused.current = false;
    setState("up");
    try {
      const init = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titleId: title.id, name: file.name, size: file.size }),
      }).then((r) => {
        if (!r.ok) throw new Error("init");
        return r.json() as Promise<{ mediaId: string; offset: number; chunk: number }>;
      });
      let offset = init.offset;
      setSent(offset);
      let window: { t: number; b: number }[] = [];

      while (offset < file.size) {
        if (paused.current) {
          setState("paused");
          return;
        }
        const blob = file.slice(offset, Math.min(file.size, offset + init.chunk));
        let attempt = 0;
        for (;;) {
          const res = await fetch(`/api/upload/${init.mediaId}?offset=${offset}`, { method: "PUT", body: blob }).catch(() => null);
          if (res?.ok || res?.status === 409) {
            offset = ((await res.json()) as { offset: number }).offset;
            break;
          }
          if (++attempt > 6) throw new Error("chunk");
          await new Promise((r) => setTimeout(r, Math.min(15000, 500 * 2 ** attempt)));
        }
        const now = performance.now();
        window = [...window, { t: now, b: offset }].filter((w) => now - w.t < 8000);
        if (window.length > 1) setSpeed(((window.at(-1)!.b - window[0].b) / (window.at(-1)!.t - window[0].t)) * 1000);
        setSent(offset);
      }

      for (const s of subs) {
        const fd = new FormData();
        fd.set("file", s.file);
        fd.set("lang", s.lang);
        await fetch(`/api/upload/${init.mediaId}/subs`, { method: "POST", body: fd });
      }
      const done = await fetch(`/api/upload/${init.mediaId}/complete`, { method: "POST" });
      if (!done.ok) throw new Error("complete");
      setState("done");
      onDone();
    } catch {
      setState("error");
    }
  };

  const pct = file ? (sent / file.size) * 100 : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-24 w-16 shrink-0 bg-ink-3">
          {title.poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={title.poster} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold leading-tight">{title.name}</p>
          <p className="font-mono text-xs text-dim">{title.year}</p>
        </div>
        {state !== "up" && (
          <button onClick={onClose} aria-label="Fermer" className="text-dim hover:text-bone">
            <X />
          </button>
        )}
      </div>

      {state === "done" ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="border-l-2 border-lime bg-ink-2 p-6">
          <p className="font-display text-2xl font-semibold">Envoyé.</p>
          <button onClick={onClose} className="mt-4 text-sm text-lime underline-offset-4 hover:underline">
            Suivant
          </button>
        </motion.div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => state === "idle" && input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f && state === "idle") setFile(f);
            }}
            className={`relative flex h-44 w-full flex-col items-center justify-center gap-3 overflow-hidden border-2 transition-colors ${drag ? "border-lime bg-lime/5" : "border-line hover:border-bone/30"}`}
          >
            {drag && (
              <motion.div
                className="absolute inset-0 opacity-20 [background:repeating-linear-gradient(-45deg,var(--color-lime)_0_2px,transparent_2px_14px)]"
                animate={{ backgroundPositionX: ["0px", "28px"] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
              />
            )}
            <FileVideo size={32} className={file ? "text-lime" : "text-dim"} />
            <span className="max-w-[90%] truncate text-sm">{file ? file.name : "Fichier vidéo"}</span>
            {file && <span className="font-mono text-xs text-dim">{mb(file.size)} Mo</span>}
          </button>
          <input ref={input} type="file" accept="video/*,.mkv,.avi,.mov,.m4v,.ts" className="hidden" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />

          <div className="flex flex-wrap items-center gap-2">
            {subs.map((s, i) => (
              <span key={i} className="flex items-center gap-2 border border-line px-3 py-1.5 font-mono text-xs">
                ST {s.lang.toUpperCase()}
                <button onClick={() => setSubs(subs.filter((_, j) => j !== i))} aria-label="Retirer">
                  <X size={12} />
                </button>
              </span>
            ))}
            {state === "idle" && (
              <label className="flex cursor-pointer items-center gap-2 border border-dashed border-line px-3 py-1.5 text-xs text-dim hover:text-bone">
                <Captions size={14} /> ST
                <input
                  type="file"
                  accept=".srt,.vtt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const guess = /\b(en|eng|english)\b/i.test(f.name) ? "en" : "fr";
                    setSubs([...subs, { file: f, lang: guess }]);
                  }}
                />
              </label>
            )}
          </div>

          {state !== "idle" && file && (
            <div className="space-y-2">
              <div className="relative h-2 overflow-hidden bg-ink-3">
                <motion.div className="absolute inset-y-0 left-0 bg-lime" animate={{ width: `${pct}%` }} transition={{ ease: "linear" }} />
                {state === "up" && (
                  <motion.div
                    className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-bone/40 to-transparent"
                    animate={{ left: ["-10%", "110%"] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                  />
                )}
              </div>
              <p className="flex justify-between font-mono text-xs tabular-nums text-dim">
                <span className="text-bone">{pct.toFixed(1)}%</span>
                <span>{speed ? `${mb(speed)} Mo/s · ${eta((file.size - sent) / speed)}` : ""}</span>
              </p>
            </div>
          )}

          <div className="flex gap-3">
            {(state === "idle" || state === "paused" || state === "error") && (
              <Button size="lg" onClick={run} disabled={!file} className="flex-1">
                {state === "idle" ? "Envoyer" : <><RotateCcw size={18} /> Reprendre</>}
              </Button>
            )}
            {state === "up" && (
              <Button size="lg" tone="ghost" onClick={() => (paused.current = true)} className="flex-1">
                <Pause size={18} /> Pause
              </Button>
            )}
          </div>
          {state === "error" && <p className="text-sm text-coral">Coupure réseau</p>}
        </>
      )}
    </motion.div>
  );
}

function MediaLine({ m, i, canDelete }: { m: MediaRow; i: number; canDelete: boolean }) {
  const [pending, start] = useTransition();
  const live = m.status === "PROCESSING" || m.status === "UPLOADING";
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }} className="relative flex items-center gap-4 py-3">
      <div className="h-16 w-11 shrink-0 bg-ink-3">
        {m.poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.poster} alt="" className="size-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate">{m.name}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11px] uppercase text-dim">
          {m.heights.length > 0 && <span>{m.heights.map((h) => (h >= 2000 ? "4K" : h)).join(" · ")}</span>}
          {m.audio.length > 0 && <span>{m.audio.join("/")}</span>}
          {m.subs.length > 0 && <span>ST {m.subs.join("/")}</span>}
          {m.by && <span>@{m.by}</span>}
        </p>
        {m.error && <p className="mt-1 truncate font-mono text-[11px] text-coral" title={m.error}>{m.error}</p>}
      </div>
      <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
        <span className={`size-2 ${statusColor[m.status]} ${live ? "animate-pulse" : ""}`} />
        {statusLabel[m.status]}
        {live && <span className="tabular-nums text-bone">{m.progress}%</span>}
      </span>
      {m.status === "FAILED" && (
        <button onClick={() => start(() => retryMedia(m.id))} aria-label="Relancer" title="Relancer" className="grid size-9 place-items-center border border-line hover:border-lime hover:text-lime">
          {pending ? <Dots /> : <Play size={14} />}
        </button>
      )}
      {canDelete && m.status !== "PROCESSING" && (
        <button
          onClick={() => confirm(`Supprimer ${m.name} ?`) && start(() => deleteMedia(m.id))}
          aria-label="Supprimer"
          title="Supprimer"
          className="grid size-9 place-items-center text-dim hover:text-coral"
        >
          <Trash2 size={15} />
        </button>
      )}
      {live && <motion.span className="absolute bottom-0 left-0 h-px bg-ice" animate={{ width: `${m.progress}%` }} />}
    </motion.li>
  );
}
