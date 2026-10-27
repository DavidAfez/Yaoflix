"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Check, ImageIcon, Plus, X } from "lucide-react";
import { votePoll } from "@/app/feed/actions";
import { useT } from "./i18n";
import { Dots } from "./ui";
import type { FeedPost } from "@/lib/feed";
import type { TierItem, TitleRef } from "@/db/schema";
import type { PosterData } from "./poster";

export const TIERS = ["S", "A", "B", "C", "D"];
// The classic tier list colours, from red to blue
const TIER_BG = ["bg-[#e2626b] text-ink", "bg-[#f0a35e] text-ink", "bg-[#f2d36b] text-ink", "bg-[#8fd18a] text-ink", "bg-[#8fc7f0] text-ink"];
export const toRef = (p: PosterData): TitleRef => ({ kind: p.kind, tmdbId: p.tmdbId, name: p.name, year: p.year, poster: p.poster });

function Thumb({ item, size = "md" }: { item: TierItem | ({ type: "title" } & TitleRef); size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-14 w-10" : "h-20 w-14";
  if (item.type === "frame")
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/clips/${item.clipId}`} alt={item.label ?? ""} title={item.label} className={`${size === "sm" ? "h-14 w-24" : "h-20 w-36"} object-cover`} />
    );
  return (
    <Link href={`/t/${item.kind}/${item.tmdbId}`} title={item.name} className={`${cls} block shrink-0 overflow-hidden bg-ink-3`}>
      {item.poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.poster} alt={item.name} className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center p-1 text-center text-[9px] leading-tight text-bone/60">{item.name}</span>
      )}
    </Link>
  );
}

/* ---------- Views ---------- */

export function ClipView({ clip }: { clip: NonNullable<FeedPost["clip"]> }) {
  const t = useT();
  if (!clip.ready)
    return (
      <div className="grid aspect-video place-items-center border border-line bg-ink-2 font-mono text-xs text-dim">
        {clip.failed ? t("Clip indisponible") : <span className="flex items-center gap-3"><Dots /> {t("Clip en préparation")}</span>}
      </div>
    );
  return <video src={`/api/clips/${clip.id}`} controls playsInline preload="metadata" className="aspect-video w-full bg-black" />;
}

export function Top5View({ data }: { data: { title: string; items: TitleRef[] } }) {
  return (
    <div className="border border-line bg-ink-2 p-4">
      <p className="mb-3 font-display text-lg font-semibold">{data.title}</p>
      <ol className="space-y-2">
        {data.items.map((it, i) => (
          <li key={`${it.kind}${it.tmdbId}`} className="flex items-center gap-3">
            <span className="w-6 font-display text-2xl font-extrabold text-lime">{i + 1}</span>
            <Thumb item={{ type: "title", ...it }} size="sm" />
            <Link href={`/t/${it.kind}/${it.tmdbId}`} className="min-w-0 truncate hover:text-lime">
              {it.name} <span className="font-mono text-[11px] text-dim">{it.year}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TierView({ data }: { data: { title: string; tiers: { label: string; items: TierItem[] }[] } }) {
  return (
    <div className="border border-line bg-ink-2">
      <p className="p-4 pb-3 font-display text-lg font-semibold">{data.title}</p>
      {data.tiers.map((tier, i) => (
        <div key={i} className="flex min-h-20 border-t border-line">
          <span className={`grid w-12 shrink-0 place-items-center font-display text-xl font-extrabold ${TIER_BG[i] ?? TIER_BG[4]}`}>{tier.label}</span>
          <div className="flex flex-1 flex-wrap gap-1 p-1">
            {tier.items.map((it, j) => (
              <Thumb key={j} item={it} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PollView({ p }: { p: FeedPost }) {
  const t = useT();
  const data = p.data as { question: string; options: { label: string }[]; answer?: number | null; frameId?: string | null; ref?: TitleRef | null };
  const [mine, setMine] = useState<number | null>(p.poll?.mine ?? null);
  const [counts, setCounts] = useState<number[]>(p.poll?.counts ?? data.options.map(() => 0));
  const [, start] = useTransition();
  useEffect(() => {
    setMine(p.poll?.mine ?? null);
    if (p.poll) setCounts(p.poll.counts);
  }, [p.poll]);
  const total = counts.reduce((a, b) => a + b, 0);
  const shown = mine !== null || p.mine;
  const quiz = data.answer != null;

  return (
    <div className="space-y-3">
      {data.frameId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/clips/${data.frameId}`} alt="" className="aspect-video w-full bg-black object-cover" />
      )}
      {data.ref && <Thumb item={{ type: "title", ...data.ref }} size="sm" />}
      <p className="font-display text-lg font-semibold">{data.question}</p>
      <div className="space-y-1.5">
        {data.options.map((o, i) => {
          const pct = total ? Math.round((counts[i] / total) * 100) : 0;
          const right = quiz && shown && data.answer === i;
          const wrong = quiz && shown && mine === i && data.answer !== i;
          return (
            <button
              key={i}
              disabled={shown}
              onClick={() => {
                setMine(i);
                setCounts((c) => c.map((n, j) => (j === i ? n + 1 : n)));
                start(() => votePoll(p.id, i));
              }}
              className={`relative flex h-11 w-full items-center overflow-hidden border px-3 text-left text-sm transition-colors ${
                right ? "border-emerald-400" : wrong ? "border-coral" : mine === i ? "border-bone/60" : "border-line enabled:hover:border-lime"
              }`}
            >
              {shown && (
                <motion.span
                  className={`absolute inset-y-0 left-0 ${right ? "bg-emerald-400/25" : wrong ? "bg-coral/20" : "bg-bone/10"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
              <span className="relative flex-1 truncate">{o.label}</span>
              {right && <Check size={15} className="relative mr-2 text-emerald-400" />}
              {shown && <span className="relative font-mono text-xs tabular-nums">{pct}%</span>}
            </button>
          );
        })}
      </div>
      <p className="font-mono text-[11px] text-dim">{t(total === 1 ? "{n} vote" : "{n} votes", { n: total })}{quiz ? ` · ${t("Quiz")}` : ""}</p>
    </div>
  );
}

/* ---------- Builders ---------- */

type Frame = { id: string; start: number; name: string; status: string };

/** The member's still frames (dev only for now). */
export function FramePicker({ onPick, onClose }: { onPick: (f: Frame) => void; onClose: () => void }) {
  const t = useT();
  const [frames, setFrames] = useState<Frame[] | null>(null);
  useEffect(() => {
    fetch("/api/clips")
      .then((r) => r.json() as Promise<{ frames: Frame[] }>)
      .then((d) => setFrames(d.frames.filter((f) => f.status === "READY")))
      .catch(() => setFrames([]));
  }, []);
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
      <div className="mt-2 border border-line p-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-widest text-dim">{t("Mes captures")}</span>
          <button onClick={onClose} aria-label={t("Fermer")} className="text-dim hover:text-bone">
            <X size={16} />
          </button>
        </div>
        {!frames ? (
          <Dots />
        ) : frames.length === 0 ? (
          <p className="py-4 text-center text-sm text-dim">{t("Aucune capture. Utilise l'appareil photo du lecteur.")}</p>
        ) : (
          <div className="grid max-h-64 grid-cols-3 gap-1 overflow-y-auto">
            {frames.map((f) => (
              <button key={f.id} onClick={() => onPick(f)} className="group relative" title={f.name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/clips/${f.id}`} alt="" className="aspect-video w-full object-cover transition-opacity group-hover:opacity-70" />
                <span className="absolute bottom-0 left-0 truncate bg-ink/80 px-1 text-[10px]">{f.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function Top5Builder({
  value,
  onChange,
  Picker,
}: {
  value: { title: string; items: TitleRef[] };
  onChange: (v: { title: string; items: TitleRef[] }) => void;
  Picker: React.ComponentType<{ onPick: (p: PosterData) => void; onClose: () => void }>;
}) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  const move = (i: number, d: number) => {
    const items = [...value.items];
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    onChange({ ...value, items });
  };
  return (
    <div className="mb-3 space-y-3 border border-line bg-ink-2 p-3">
      <input
        value={value.title}
        onChange={(e) => onChange({ ...value, title: e.target.value })}
        maxLength={80}
        placeholder={t("Top 5 de…")}
        className="w-full border-b border-line bg-transparent pb-2 font-display text-lg font-semibold outline-none placeholder:text-bone/30 focus:border-lime"
      />
      <ol className="space-y-1.5">
        {value.items.map((it, i) => (
          <li key={`${it.kind}${it.tmdbId}`} className="flex items-center gap-2">
            <span className="w-5 font-display font-extrabold text-lime">{i + 1}</span>
            <Thumb item={{ type: "title", ...it }} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm">{it.name}</span>
            <button onClick={() => move(i, -1)} aria-label={t("Monter")} className="text-dim hover:text-bone"><ArrowUp size={15} /></button>
            <button onClick={() => move(i, 1)} aria-label={t("Descendre")} className="text-dim hover:text-bone"><ArrowDown size={15} /></button>
            <button onClick={() => onChange({ ...value, items: value.items.filter((_, j) => j !== i) })} aria-label={t("Retirer")} className="text-dim hover:text-coral"><X size={15} /></button>
          </li>
        ))}
      </ol>
      {value.items.length < 5 && !picking && (
        <button onClick={() => setPicking(true)} className="flex h-9 items-center gap-2 border border-dashed border-line px-3 text-sm text-bone/70 hover:border-lime hover:text-lime">
          <Plus size={15} /> {t("Ajouter")} ({value.items.length}/5)
        </button>
      )}
      <AnimatePresence>
        {picking && (
          <Picker
            onPick={(p) => {
              if (!value.items.some((x) => x.kind === p.kind && x.tmdbId === p.tmdbId)) onChange({ ...value, items: [...value.items, toRef(p)] });
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function TierBuilder({
  value,
  onChange,
  Picker,
  frames,
}: {
  value: { title: string; tiers: { label: string; items: TierItem[] }[] };
  onChange: (v: { title: string; tiers: { label: string; items: TierItem[] }[] }) => void;
  Picker: React.ComponentType<{ onPick: (p: PosterData) => void; onClose: () => void }>;
  frames: boolean;
}) {
  const t = useT();
  const [adding, setAdding] = useState<{ tier: number; source: "title" | "frame" } | null>(null);
  const add = (tier: number, item: TierItem) =>
    onChange({ ...value, tiers: value.tiers.map((x, i) => (i === tier ? { ...x, items: [...x.items, item] } : x)) });
  const remove = (tier: number, j: number) =>
    onChange({ ...value, tiers: value.tiers.map((x, i) => (i === tier ? { ...x, items: x.items.filter((_, k) => k !== j) } : x)) });
  return (
    <div className="mb-3 border border-line bg-ink-2">
      <input
        value={value.title}
        onChange={(e) => onChange({ ...value, title: e.target.value })}
        maxLength={80}
        placeholder={t("Tier list de…")}
        className="w-full border-b border-line bg-transparent p-3 font-display text-lg font-semibold outline-none placeholder:text-bone/30 focus:border-lime"
      />
      {value.tiers.map((tier, i) => (
        <div key={i} className="border-b border-line last:border-b-0">
          <div className="flex min-h-16">
            <span className={`grid w-12 shrink-0 place-items-center font-display text-xl font-extrabold ${TIER_BG[i]}`}>{tier.label}</span>
            <div className="flex flex-1 flex-wrap items-center gap-1 p-1">
              {tier.items.map((it, j) => (
                <span key={j} className="relative">
                  <Thumb item={it} size="sm" />
                  <button onClick={() => remove(i, j)} aria-label={t("Retirer")} className="absolute -right-1 -top-1 grid size-5 place-items-center bg-ink text-bone hover:text-coral">
                    <X size={11} />
                  </button>
                </span>
              ))}
              <button onClick={() => setAdding({ tier: i, source: "title" })} aria-label={t("Ajouter un titre")} className="grid h-14 w-10 place-items-center border border-dashed border-line text-dim hover:border-lime hover:text-lime">
                <Plus size={15} />
              </button>
              {frames && (
                <button onClick={() => setAdding({ tier: i, source: "frame" })} aria-label={t("Ajouter une capture")} className="grid h-14 w-10 place-items-center border border-dashed border-line text-dim hover:border-lime hover:text-lime">
                  <ImageIcon size={15} />
                </button>
              )}
            </div>
          </div>
          <AnimatePresence>
            {adding?.tier === i && adding.source === "title" && (
              <div className="px-2 pb-2">
                <Picker onPick={(p) => (add(i, { type: "title", ...toRef(p) }), setAdding(null))} onClose={() => setAdding(null)} />
              </div>
            )}
            {adding?.tier === i && adding.source === "frame" && (
              <div className="px-2 pb-2">
                <FramePicker onPick={(f) => (add(i, { type: "frame", clipId: f.id, label: f.name }), setAdding(null))} onClose={() => setAdding(null)} />
              </div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

export type PollDraft = { question: string; options: { label: string }[]; answer: number | null; frameId: string | null; ref: TitleRef | null };

export function PollBuilder({
  value,
  onChange,
  Picker,
  frames,
}: {
  value: PollDraft;
  onChange: (v: PollDraft) => void;
  Picker: React.ComponentType<{ onPick: (p: PosterData) => void; onClose: () => void }>;
  frames: boolean;
}) {
  const t = useT();
  const [adding, setAdding] = useState<null | "title" | "frame">(null);
  const quiz = value.answer !== null;
  return (
    <div className="mb-3 space-y-3 border border-line bg-ink-2 p-3">
      <input
        value={value.question}
        onChange={(e) => onChange({ ...value, question: e.target.value })}
        maxLength={200}
        placeholder={t("Ta question")}
        className="w-full border-b border-line bg-transparent pb-2 font-display text-lg font-semibold outline-none placeholder:text-bone/30 focus:border-lime"
      />
      {value.options.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          {quiz && (
            <button
              onClick={() => onChange({ ...value, answer: i })}
              aria-label={t("Bonne réponse")}
              className={`grid size-6 shrink-0 place-items-center border ${value.answer === i ? "border-lime bg-lime text-ink" : "border-line"}`}
            >
              {value.answer === i && <Check size={13} />}
            </button>
          )}
          <input
            value={o.label}
            onChange={(e) => onChange({ ...value, options: value.options.map((x, j) => (j === i ? { label: e.target.value } : x)) })}
            maxLength={80}
            placeholder={t("Réponse {n}", { n: i + 1 })}
            className="h-10 flex-1 border border-line bg-transparent px-3 text-sm outline-none focus:border-lime"
          />
          {value.options.length > 2 && (
            <button
              onClick={() => onChange({ ...value, options: value.options.filter((_, j) => j !== i), answer: value.answer === i ? 0 : value.answer !== null && value.answer > i ? value.answer - 1 : value.answer })}
              aria-label={t("Retirer")}
              className="text-dim hover:text-coral"
            >
              <X size={15} />
            </button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {value.options.length < 4 && (
          <button onClick={() => onChange({ ...value, options: [...value.options, { label: "" }] })} className="flex h-9 items-center gap-2 border border-dashed border-line px-3 text-sm text-bone/70 hover:border-lime hover:text-lime">
            <Plus size={15} /> {t("Réponse")}
          </button>
        )}
        <button
          onClick={() => onChange({ ...value, answer: quiz ? null : 0 })}
          className={`h-9 border px-3 text-sm transition-colors ${quiz ? "border-lime text-lime" : "border-line text-bone/70 hover:border-bone/40"}`}
        >
          {t("Quiz")}
        </button>
        <button onClick={() => setAdding(adding === "title" ? null : "title")} className={`h-9 border px-3 text-sm ${value.ref ? "border-lime text-lime" : "border-line text-bone/70 hover:border-bone/40"}`}>
          {value.ref ? value.ref.name : t("Film ou série")}
        </button>
        {frames && (
          <button onClick={() => setAdding(adding === "frame" ? null : "frame")} className={`flex h-9 items-center gap-2 border px-3 text-sm ${value.frameId ? "border-lime text-lime" : "border-line text-bone/70 hover:border-bone/40"}`}>
            <ImageIcon size={15} /> {t("Capture")}
          </button>
        )}
      </div>
      {value.frameId && (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/clips/${value.frameId}`} alt="" className="aspect-video w-full object-cover" />
          <button onClick={() => onChange({ ...value, frameId: null })} aria-label={t("Retirer")} className="absolute right-1 top-1 grid size-7 place-items-center bg-ink/80 hover:text-coral">
            <X size={14} />
          </button>
        </div>
      )}
      <AnimatePresence>
        {adding === "title" && <Picker onPick={(p) => (onChange({ ...value, ref: toRef(p) }), setAdding(null))} onClose={() => setAdding(null)} />}
        {adding === "frame" && <FramePicker onPick={(f) => (onChange({ ...value, frameId: f.id }), setAdding(null))} onClose={() => setAdding(null)} />}
      </AnimatePresence>
    </div>
  );
}
