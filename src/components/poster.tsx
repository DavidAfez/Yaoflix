"use client";
import Link from "next/link";
import { useRef, useState, useEffect } from "react";
import { motion } from "motion/react";
import { Ban, ChevronLeft, ChevronRight, Eye, EyeOff, Heart, MessageSquare } from "lucide-react";
import { useMark } from "./marks";
import { fmtRating } from "@/lib/rating";

export type PosterData = {
  kind: string;
  tmdbId: number;
  name: string;
  year: number | null;
  poster: string | null;
  ready?: boolean;
};

export function Poster({ t, i = 0, size = "md", hideNever = false }: { t: PosterData; i?: number; size?: "sm" | "md" | "lg"; hideNever?: boolean }) {
  const mark = useMark(t);
  const seen = Boolean(mark?.seen);
  const never = Boolean(mark?.never);
  // Rows of suggestions drop refused titles at once; search and profile keep them, marked
  if (hideNever && never) return null;
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i, 8) * 0.03, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative shrink-0 snap-start ${size === "lg" ? "w-40 md:w-52" : size === "sm" ? "w-28 md:w-36" : "w-32 md:w-44"}`}
    >
      <Link href={`/t/${t.kind}/${t.tmdbId}`} className="block">
        <div className="relative aspect-[2/3] overflow-hidden bg-ink-3">
          {t.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.poster}
              alt=""
              loading="lazy"
              className={`size-full object-cover transition-[transform,filter,opacity] duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.06] ${
                never ? "opacity-20 grayscale" : seen ? "opacity-45 grayscale group-hover:opacity-80 group-hover:grayscale-0" : ""
              }`}
            />
          ) : (
            <div className={`grid size-full place-items-center bg-gradient-to-br from-ink-3 to-ink font-display text-6xl font-extrabold ${seen ? "text-bone/5" : "text-bone/10"}`}>
              {t.name.charAt(0)}
            </div>
          )}
          {t.ready && <span className={`absolute inset-y-0 left-0 w-1 ${seen ? "bg-lime/40" : "bg-lime"}`} aria-label="Dispo" />}
          {t.kind === "tv" && (
            <span className="absolute bottom-0 left-0 bg-ink/85 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-bone">Série</span>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm ${seen ? "text-bone/50" : ""}`}>{t.name}</span>
          {mark?.rating ? (
            <span className="shrink-0 font-mono text-[11px] text-lime">★{fmtRating(mark.rating)}</span>
          ) : (
            t.year && <span className="shrink-0 font-mono text-[11px] text-dim">{t.year}</span>
          )}
        </div>
      </Link>

      {mark && (
        // Siblings of the link, not inside it: buttons cannot live in an <a>
        <div className="absolute right-1 top-1 flex flex-col gap-0.5 transition-opacity md:gap-1 duration-200 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
          <QuickAction on={mark.liked} label="J'aime" onClick={mark.toggleLike} tone="coral">
            <Heart className="size-3 md:size-[15px]" fill={mark.liked ? "currentColor" : "none"} />
          </QuickAction>
          <QuickAction on={seen} label={seen ? "Vu" : "Déjà vu"} onClick={mark.toggleSeen}>
            {seen ? <EyeOff className="size-3 md:size-[15px]" /> : <Eye className="size-3 md:size-[15px]" />}
          </QuickAction>
          <QuickAction on={mark.reviewed} label="Avis" onClick={mark.review}>
            <MessageSquare className="size-3 md:size-[15px]" fill={mark.reviewed ? "currentColor" : "none"} />
          </QuickAction>
          <QuickAction on={never} label="Jamais" onClick={mark.toggleNever} tone="coral">
            <Ban className="size-3 md:size-[15px]" />
          </QuickAction>
        </div>
      )}
      {/* Visible markers when the action buttons are hidden (desktop, neither hovered nor focused) */}
      {mark && (mark.liked || seen || never) && (
        <div className="pointer-events-none absolute right-1.5 top-1.5 flex gap-1 transition-opacity [@media(hover:hover)]:group-hover:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-0 [@media(hover:none)]:hidden">
          {never ? (
            <Ban size={14} className="text-coral" />
          ) : mark.liked ? (
            <Heart size={14} className="text-coral" fill="currentColor" />
          ) : (
            <Eye size={14} className="text-bone/80" />
          )}
        </div>
      )}
    </motion.div>
  );
}

function QuickAction({ on, label, onClick, children, tone = "lime" }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode; tone?: "lime" | "coral" }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.8 }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={`grid size-6 place-items-center bg-ink/70 backdrop-blur transition-colors md:size-8 ${
        on ? (tone === "coral" ? "text-coral" : "text-lime") : "text-bone hover:text-lime"
      }`}
    >
      <motion.span key={String(on)} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 14 }}>
        {children}
      </motion.span>
    </motion.button>
  );
}

/**
 * A horizontal row, Netflix style: the posters scroll inside side gutters and never touch the screen edge.
 * Arrows page through it on desktop.
 */
export function Row({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => {
    const el = scroller.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  useEffect(update, [children]);
  const page = (dir: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <section className="group/row mt-10 md:mt-12">
      <div className="mb-4 flex items-baseline gap-3 px-4 md:px-10">
        <h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
        {count != null && <span className="font-mono text-xs text-lime">{String(count).padStart(2, "0")}</span>}
      </div>
      <div className="relative mx-4 md:mx-10">
        <div ref={scroller} onScroll={update} className="scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:gap-5">
          {children}
        </div>
        {!edge.start && <RowArrow side="left" onClick={() => page(-1)} />}
        {!edge.end && <RowArrow side="right" onClick={() => page(1)} />}
      </div>
    </section>
  );
}

function RowArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Précédents" : "Suivants"}
      className={`absolute inset-y-0 z-10 hidden w-10 -translate-y-1 items-center justify-center bg-ink/80 text-bone opacity-0 backdrop-blur transition-opacity hover:text-lime group-hover/row:opacity-100 md:flex ${
        side === "left" ? "-left-10" : "-right-10"
      }`}
    >
      <Icon size={28} />
    </button>
  );
}
