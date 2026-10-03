"use client";
import Link from "next/link";
import { useTransition, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Upload, Hand } from "lucide-react";
import { Dropdown } from "@/components/dropdown";
import { rejectLabels } from "@/lib/labels";
import { claimTitle, refuseTitle } from "./actions";
import type { RejectReason } from "@/db/schema";

export type QueueItem = {
  titleId: number;
  kind: string;
  tmdbId: number;
  name: string;
  year: number | null;
  poster: string | null;
  count: number;
  since: string;
  claimed: boolean;
  quality: string;
  audio: string;
  subs: string;
};

const ago = (iso: string) => {
  const h = (Date.now() - new Date(iso).getTime()) / 3600_000;
  return h < 1 ? "<1h" : h < 48 ? `${Math.floor(h)}h` : `${Math.floor(h / 24)}j`;
};

const reasons = Object.entries(rejectLabels).map(([value, label]) => ({ value: value as RejectReason, label }));

export function Queue({ items }: { items: QueueItem[] }) {
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [, start] = useTransition();
  const visible = items.filter((i) => !gone.has(i.titleId));

  return (
    <div>
      <div className="mb-8 flex items-baseline gap-4">
        <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-6xl">File</h1>
        <span className="font-mono text-lime">{String(visible.length).padStart(2, "0")}</span>
      </div>
      {visible.length === 0 && <p className="py-24 text-center font-display text-4xl text-bone/15">Rien à faire.</p>}
      <ul className="divide-y divide-line border-y border-line">
        <AnimatePresence initial={false}>
          {visible.map((it, i) => (
            <motion.li
              key={it.titleId}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
              exit={{ opacity: 0, x: 80, height: 0 }}
              className="flex flex-wrap items-center gap-4 py-4 md:flex-nowrap"
            >
              <Link href={`/t/${it.kind}/${it.tmdbId}`} className="flex min-w-0 flex-1 items-center gap-4">
                <div className="relative h-20 w-14 shrink-0 bg-ink-3">
                  {it.poster && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.poster} alt="" className="size-full object-cover" />
                  )}
                  {it.claimed && <span className="absolute inset-y-0 left-0 w-1 bg-ice" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold">{it.name}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-[11px] uppercase tracking-wider text-dim">
                    <span>{it.year}</span>
                    <span className="text-bone">{it.quality === "auto" ? "Auto" : it.quality === "2160" ? "4K" : `${it.quality}p`}</span>
                    <span className="text-bone">{it.audio === "any" ? "VF/VO" : it.audio.toUpperCase()}</span>
                    {it.subs !== "none" && <span className="text-bone">ST {it.subs.toUpperCase()}</span>}
                    <span>{ago(it.since)}</span>
                  </p>
                </div>
              </Link>
              <span className="font-display text-3xl font-semibold tabular-nums text-lime" title="Demandes">
                ×{it.count}
              </span>
              <div className="flex items-center gap-2">
                {!it.claimed && (
                  <button onClick={() => start(() => claimTitle(it.titleId))} aria-label="Prendre" title="Prendre" className="grid size-10 place-items-center border border-line hover:border-ice hover:text-ice">
                    <Hand size={17} />
                  </button>
                )}
                <Link href={`/studio/library?title=${it.titleId}`} className="notch flex h-10 items-center gap-2 bg-lime px-4 text-sm font-semibold text-ink">
                  <Upload size={16} /> Uploader
                </Link>
                <Dropdown
                  label="Refuser"
                  tone="coral"
                  options={reasons}
                  onPick={(r) => {
                    setGone(new Set(gone).add(it.titleId));
                    start(() => refuseTitle(it.titleId, r));
                  }}
                />
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
