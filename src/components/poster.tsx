"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { Eye, EyeOff, Heart, MessageSquare } from "lucide-react";
import { useMark } from "./marks";

export type PosterData = {
  kind: string;
  tmdbId: number;
  name: string;
  year: number | null;
  poster: string | null;
  ready?: boolean;
};

export function Poster({ t, i = 0, size = "md" }: { t: PosterData; i?: number; size?: "md" | "lg" }) {
  const mark = useMark(t);
  const seen = Boolean(mark?.seen);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: Math.min(i, 10) * 0.045, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative ${size === "lg" ? "w-44 shrink-0 snap-start md:w-56" : "w-32 shrink-0 snap-start md:w-44"}`}
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
                seen ? "opacity-45 grayscale group-hover:opacity-80 group-hover:grayscale-0" : ""
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
          {t.year && <span className="shrink-0 font-mono text-[11px] text-dim">{t.year}</span>}
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
        </div>
      )}
      {/* Visible markers when the action buttons are hidden (desktop, not hovered) */}
      {mark && (mark.liked || seen) && (
        <div className="pointer-events-none absolute right-1.5 top-1.5 flex gap-1 [@media(hover:hover)]:group-hover:opacity-0 [@media(hover:none)]:hidden">
          {mark.liked && <Heart size={14} className="text-coral" fill="currentColor" />}
          {seen && !mark.liked && <Eye size={14} className="text-bone/80" />}
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

export function Row({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-baseline gap-3 px-4 md:px-10">
        <h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
        {count != null && <span className="font-mono text-xs text-lime">{String(count).padStart(2, "0")}</span>}
      </div>
      <div className="scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:gap-5 md:px-10">{children}</div>
    </section>
  );
}
