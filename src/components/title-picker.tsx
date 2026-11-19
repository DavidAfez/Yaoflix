"use client";
import { kindLabel, type Kind } from "@/lib/kinds";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Dots } from "./ui";
import { useT } from "./i18n";
import type { PosterData } from "./poster";

const SHELVES = [
  { k: "screen", label: "Films et séries" },
  { k: "album", label: "Musique" },
  { k: "book", label: "Livres" },
] as const;

export function TitlePicker({ onPick, onClose }: { onPick: (t: PosterData) => void; onClose: () => void }) {
  const tr = useT();
  const [q, setQ] = useState("");
  const [shelf, setShelf] = useState<(typeof SHELVES)[number]["k"]>("screen");
  const [items, setItems] = useState<PosterData[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setItems([]);
    let stale = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}${shelf === "screen" ? "" : `&type=${shelf}`}`);
        const data = (await res.json()) as { results: PosterData[] };
        if (!stale) setItems(data.results?.slice(0, 8) ?? []);
      } catch {
      } finally {
        if (!stale) setLoading(false);
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, shelf]);
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
      <div className="mt-2 border border-line">
        <div className="flex gap-4 border-b border-line px-3 pt-2">
          {SHELVES.map((x) => (
            <button key={x.k} type="button" onClick={() => setShelf(x.k)} className={`relative pb-2 text-xs ${shelf === x.k ? "text-bone" : "text-dim hover:text-bone"}`}>
              {tr(x.label)}
              {shelf === x.k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 border-b border-line px-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder={tr("Chercher un titre")}
            className="h-11 w-full bg-transparent outline-none placeholder:text-bone/30"
          />
          {loading && <Dots />}
        </div>
        <ul className="max-h-72 overflow-y-auto">
          {items.map((t) => (
            <li key={`${t.kind}${t.tmdbId}`}>
              <button type="button" onClick={() => onPick(t)} className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-ink-2">
                <div className={`h-12 ${t.kind === "album" ? "w-12" : "w-8"} shrink-0 overflow-hidden bg-ink-3`}>
                  {t.poster && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.poster} alt="" className="size-full object-cover" />
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="font-mono text-[11px] text-dim">{t.kind === "movie" ? t.year : tr(kindLabel[t.kind as Kind] ?? "")}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
