"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, Check, Clapperboard, ImagePlus, Smile, X } from "lucide-react";
import { useT, useTag } from "./i18n";
import { Dots } from "./ui";
import type { PostMedia, TitleRef } from "@/db/schema";

const EMOJIS = "😂 🤣 😭 😍 🥹 😮 😱 🤯 😴 🙄 😤 😡 🥶 🤔 🫠 😎 🤩 🥲 😬 👀 👏 🙌 🔥 💯 ✨ 💀 ❤️ 💔 🖤 🎬 🍿 🎥 📽️ 🎞️ 🎭 🏆 ⭐ 🌟 👑 🎵 🎧 🌍 🌙 ☀️ 🌧️ ⚡ 💣 🩸 🔪 👻 🤖 👽 🦖 🐉 🚀 🏎️ 🍷 ☕".split(" ");

/** Popover on top of a toolbar button, closed by any click outside. */
function Pop({ open, onClose, children, className = "" }: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.parentElement?.contains(e.target as Node) && onClose();
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
          className={`absolute left-0 top-11 z-30 border-l-2 border-lime bg-ink-2 p-2 shadow-2xl shadow-black/60 ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ToolBtn({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`grid size-9 shrink-0 place-items-center transition-colors ${on ? "text-lime" : "text-dim hover:text-lime"}`}>
      {children}
    </button>
  );
}

export function EmojiTool({ onPick }: { onPick: (e: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <ToolBtn label={t("Emoji")} on={open} onClick={() => setOpen(!open)}>
        <Smile size={18} />
      </ToolBtn>
      <Pop open={open} onClose={() => setOpen(false)} className="w-72">
        <div className="grid grid-cols-8 gap-0.5">
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => onPick(e)} className="grid size-8 place-items-center text-lg transition-transform hover:scale-125">
              {e}
            </button>
          ))}
        </div>
      </Pop>
    </div>
  );
}

type Gif = { id: string; preview: string; url: string; w: number; h: number };

export function GifTool({ onPick, disabled }: { onPick: (m: PostMedia) => void; disabled?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Gif[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let stale = false;
    const h = setTimeout(async () => {
      const res = await fetch(`/api/gifs?q=${encodeURIComponent(q)}`).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { enabled: boolean; results: Gif[] } | null;
      if (stale || !data) return;
      setEnabled(data.enabled);
      setItems(data.results);
    }, 300);
    return () => {
      stale = true;
      clearTimeout(h);
    };
  }, [open, q]);
  // Probe once: without a Tenor key the button disappears
  useEffect(() => {
    fetch("/api/gifs?q=")
      .then((r) => r.json() as Promise<{ enabled: boolean }>)
      .then((d) => setEnabled(d.enabled))
      .catch(() => setEnabled(false));
  }, []);
  if (!enabled) return null;
  return (
    <div className="relative">
      <ToolBtn label="GIF" on={open} onClick={() => !disabled && setOpen(!open)}>
        <span className="border border-current px-1 font-mono text-[10px] font-bold leading-4">GIF</span>
      </ToolBtn>
      <Pop open={open} onClose={() => setOpen(false)} className="w-80">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Chercher un GIF")} className="mb-2 h-9 w-full border border-line bg-transparent px-3 text-sm outline-none focus:border-lime" />
        {!items ? (
          <Dots />
        ) : (
          <div className="grid max-h-72 grid-cols-3 gap-1 overflow-y-auto">
            {items.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  onPick({ type: "gif", url: g.url, w: g.w, h: g.h });
                  setOpen(false);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.preview} alt="" className="aspect-square w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        <p className="mt-1 text-right font-mono text-[9px] text-dim">Tenor</p>
      </Pop>
    </div>
  );
}

export function ImageTool({ onAdd, disabled }: { onAdd: (m: PostMedia) => void; disabled?: boolean }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (files: FileList) => {
    setBusy(true);
    setError(null);
    for (const f of [...files].slice(0, 4)) {
      const fd = new FormData();
      fd.set("file", f);
      const res = await fetch("/api/images", { method: "POST", body: fd }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (data?.id) onAdd({ type: "image", id: data.id });
      else setError(t(data?.error ?? "Envoi impossible"));
    }
    setBusy(false);
  };
  return (
    <div className="relative">
      <ToolBtn label={t("Image")} onClick={() => !disabled && input.current?.click()}>
        {busy ? <Dots /> : <ImagePlus size={18} />}
      </ToolBtn>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files)} />
      {error && <p className="absolute left-0 top-10 z-20 whitespace-nowrap bg-ink px-2 text-xs text-coral">{error}</p>}
    </div>
  );
}

export function ScheduleTool({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const min = new Date(Date.now() + 5 * 60_000);
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return (
    <div className="relative">
      <ToolBtn label={t("Programmer")} on={open || Boolean(value)} onClick={() => setOpen(!open)}>
        <CalendarClock size={18} />
      </ToolBtn>
      <Pop open={open} onClose={() => setOpen(false)} className="w-64 space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-dim">{t("Publier le")}</p>
        <input
          type="datetime-local"
          min={local(min)}
          max={local(new Date(Date.now() + 30 * 86400_000))}
          value={value ? local(new Date(value)) : ""}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
          className="h-10 w-full border border-line bg-transparent px-2 text-sm outline-none [color-scheme:dark] focus:border-lime"
        />
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-xs text-dim hover:text-coral">
            {t("Publier maintenant")}
          </button>
        )}
      </Pop>
    </div>
  );
}

export function ScheduleChip({ value, onClear }: { value: string; onClear: () => void }) {
  const tag = useTag();
  return (
    <span className="flex h-8 items-center gap-2 border border-lime px-2 text-xs text-lime">
      <CalendarClock size={13} />
      {new Date(value).toLocaleString(tag, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
      <button type="button" onClick={onClear} className="text-lime/70 hover:text-lime">
        <X size={12} />
      </button>
    </span>
  );
}

/** Attached pictures, GIFs and stills, removable before posting. */
export function MediaStrip({ media, onRemove }: { media: PostMedia[]; onRemove: (i: number) => void }) {
  const t = useT();
  if (!media.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {media.map((m, i) => (
        <span key={i} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaSrc(m)} alt="" className="h-24 w-32 object-cover" />
          <button type="button" onClick={() => onRemove(i)} aria-label={t("Retirer")} className="absolute right-1 top-1 grid size-6 place-items-center bg-ink/80 hover:text-coral">
            <X size={13} />
          </button>
        </span>
      ))}
    </div>
  );
}

export const mediaSrc = (m: PostMedia) => (m.type === "image" ? `/api/images/${m.id}` : m.type === "frame" ? `/api/clips/${m.clipId}` : m.url);

/** Pictures inside a post: one full width, two to four in a grid. */
export function PostMediaView({ media }: { media: PostMedia[] }) {
  if (!media.length) return null;
  return (
    <div className={`mt-3 grid gap-1 ${media.length > 1 ? "grid-cols-2" : ""}`}>
      {media.map((m, i) => (
        <a key={i} href={mediaSrc(m)} target="_blank" rel="noreferrer" className="block overflow-hidden bg-ink-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaSrc(m)} alt="" loading="lazy" className={`w-full object-cover ${media.length > 1 ? "aspect-square" : "max-h-[32rem]"}`} />
        </a>
      ))}
    </div>
  );
}

/**
 * Watches the draft and proposes, discreetly, the film or series it seems to name.
 * One tap attaches it, the cross dismisses it for good.
 */
export function MentionHint({ text, onAccept, active }: { text: string; onAccept: (t: TitleRef) => void; active: boolean }) {
  const t = useT();
  const [match, setMatch] = useState<(TitleRef & { phrase: string }) | null>(null);
  const dismissed = useRef(new Set<string>());
  useEffect(() => {
    if (!active || text.trim().length < 5) return setMatch(null);
    let stale = false;
    const h = setTimeout(async () => {
      const res = await fetch(`/api/titles/mention?text=${encodeURIComponent(text.slice(0, 400))}`).catch(() => null);
      const data = (await res?.json().catch(() => null)) as { match: (TitleRef & { phrase: string }) | null } | null;
      if (stale) return;
      const m = data?.match ?? null;
      setMatch(m && !dismissed.current.has(`${m.kind}:${m.tmdbId}`) ? m : null);
    }, 700);
    return () => {
      stale = true;
      clearTimeout(h);
    };
  }, [text, active]);
  if (!active || !match) return null;
  return (
    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1 flex items-center gap-2 text-sm">
      <Clapperboard size={13} className="shrink-0 text-ice/70" />
      <button type="button" onClick={() => onAccept(match)} className="min-w-0 truncate text-ice underline decoration-ice/40 decoration-dotted underline-offset-4 hover:decoration-ice">
        {match.name}
      </button>
      {match.year && <span className="font-mono text-[11px] text-dim">{match.year}</span>}
      <button type="button" onClick={() => onAccept(match)} aria-label={t("C'est ce titre")} title={t("C'est ce titre")} className="text-dim hover:text-ice">
        <Check size={14} />
      </button>
      <button
        type="button"
        onClick={() => {
          dismissed.current.add(`${match.kind}:${match.tmdbId}`);
          setMatch(null);
        }}
        aria-label={t("Pas ce titre")}
        title={t("Pas ce titre")}
        className="text-dim hover:text-coral"
      >
        <X size={14} />
      </button>
    </motion.p>
  );
}
