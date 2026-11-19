"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BookOpen, Check, Clapperboard, Crown, Disc3, Eye, Film, Flame, Ghost, Globe, Heart, Hourglass, Infinity as InfinityIcon, Landmark, Laugh,
  CalendarCheck, Headphones, Library, ListChecks, PenLine, Lock, Medal, MessageCircle, MessagesSquare, Mic, Moon, Palette, Rocket, Send, Shapes, Shuffle, Sparkles, Star, Tv, X,
} from "lucide-react";
import { TIERS, tierLabel, trophyById, type Tier } from "@/lib/trophy-defs";
import type { TrophyView } from "@/lib/trophies";
import { trophiesSeen } from "@/app/trophies";
import { useLocale, useT } from "./i18n";
import { engage } from "./engage";

const ICONS: Record<string, typeof Film> = {
  film: Film, tv: Tv, disc: Disc3, book: BookOpen, message: MessageCircle, star: Star, mic: Mic, send: Send, ghost: Ghost, laugh: Laugh,
  palette: Palette, eye: Eye, heart: Heart, rocket: Rocket, shapes: Shapes, clapper: Clapperboard, shuffle: Shuffle, check: Check,
  messages: MessagesSquare, moon: Moon, medal: Medal, hourglass: Hourglass, stars: Sparkles, flame: Flame, crown: Crown, landmark: Landmark,
  globe: Globe, infinity: InfinityIcon, headphones: Headphones, library: Library, calendar: CalendarCheck, pen: PenLine, list: ListChecks,
};

/** Bronze, silver, gold, ice, then the site's accent for the one nobody gets. */
export const TIER_COLOR: Record<Tier, string> = { easy: "#c98a5a", medium: "#b8bec7", hard: "#e8c15a", brutal: "#8fe3ff", impossible: "#e2626b" };

export function TrophyBadge({ id, won, size = 44 }: { id: string; won: boolean; size?: number }) {
  const def = trophyById.get(id);
  if (!def) return null;
  const Icon = ICONS[def.icon] ?? Medal;
  const color = TIER_COLOR[def.tier];
  return (
    <span
      className="notch relative grid shrink-0 place-items-center overflow-hidden"
      style={{ width: size, height: size, background: won ? `${color}22` : "rgb(243 240 232 / 0.04)", boxShadow: `inset 0 0 0 1.5px ${won ? color : "rgb(243 240 232 / 0.1)"}` }}
    >
      {def.tier === "impossible" && <span className="sheen absolute inset-0" aria-hidden />}
      <Icon size={size * 0.45} style={{ color: won ? color : "#8c8a84" }} strokeWidth={2} />
    </span>
  );
}

/** Every trophy, by difficulty, with progress and how rare it is among members. */
export function TrophyBoard({ items }: { items: TrophyView[] }) {
  const t = useT();
  const locale = useLocale();
  const count = items.filter((i) => i.won).length;
  return (
    <div className="space-y-12">
      <p className="font-display text-4xl font-extrabold tracking-tight md:text-5xl">
        {count}
        <span className="text-dim">/{items.length - 1}</span>
        <span className="ml-3 align-middle font-mono text-xs font-normal text-dim">{t("trophées")}</span>
      </p>
      {TIERS.map((tier) => {
        const list = items.filter((i) => trophyById.get(i.id)?.tier === tier);
        return (
          <section key={tier}>
            <h3 className="mb-4 flex items-center gap-3 font-mono text-xs uppercase tracking-widest" style={{ color: TIER_COLOR[tier] }}>
              <span className="h-px w-6" style={{ background: TIER_COLOR[tier] }} />
              {t(tierLabel[tier])}
            </h3>
            <ul className={`grid gap-3 ${tier === "impossible" ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
              {list.map((it, i) => {
                const def = trophyById.get(it.id)!;
                const ratio = it.need ? it.have / it.need : 0;
                const impossible = tier === "impossible";
                return (
                  <motion.li
                    key={it.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 8) * 0.03 }}
                    className={`flex items-center gap-4 border p-4 ${it.won ? "border-line bg-ink-2" : "border-line/60"} ${impossible ? "border-lime/40 bg-gradient-to-r from-lime/10 to-transparent" : ""}`}
                  >
                    <TrophyBadge id={it.id} won={Boolean(it.won)} size={impossible ? 56 : 44} />
                    <div className="min-w-0 flex-1">
                      <p className={`flex items-center gap-2 font-semibold ${it.won ? "" : "text-bone/70"}`}>
                        {t(def.name)}
                        {!it.won && !impossible && ratio === 0 && <Lock size={12} className="text-dim" />}
                      </p>
                      <p className="text-sm text-dim">{t(def.hint)}</p>
                      {it.won ? (
                        <p className="mt-1 font-mono text-[11px] text-dim">
                          {new Date(it.won).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                          {" · "}
                          {t("{n} % des membres", { n: it.rare })}
                        </p>
                      ) : (
                        <div className="mt-2 flex items-center gap-3">
                          <span className="h-1 flex-1 bg-bone/10">
                            <motion.span
                              className="block h-full"
                              style={{ background: TIER_COLOR[tier] }}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, ratio * 100)}%` }}
                              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                            />
                          </span>
                          <span className="font-mono text-[11px] tabular-nums text-dim">
                            {it.have}/{it.need}
                          </span>
                        </div>
                      )}
                      {impossible && <p className="mt-2 text-xs text-lime">{t("Personne ne l'a. Personne ne l'aura. Sauf si…")}</p>}
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** A member's won trophies, on their public profile. */
export function TrophyShelf({ ids }: { ids: string[] }) {
  const t = useT();
  if (!ids.length) return null;
  return (
    <section className="mt-10" aria-label={t("Trophées")}>
      <p className="mb-3 font-mono text-xs text-dim">
        {t("Trophées")} <span className="text-lime">{ids.length}</span>
      </p>
      <ul className="flex flex-wrap gap-2">
        {ids.map((id) => {
          const def = trophyById.get(id)!;
          return (
            <li key={id} title={`${t(def.name)} · ${t(def.hint)}`}>
              <TrophyBadge id={id} won size={36} />
              <span className="sr-only">{t(def.name)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Tells the trophy watcher something may have been earned (a mark, a post, a review). */
export const progressed = () => window.dispatchEvent(new Event("gf:progress"));

/**
 * Checks for new trophies when the member moves around or does something, and celebrates them
 * one at a time at the bottom of the screen.
 */
export function TrophyWatcher() {
  const t = useT();
  const path = usePathname();
  const [batches, setQueue] = useState<string[][]>([]);
  const last = useRef(0);
  const queue = useRef(new Set<string>());

  const check = useCallback(async (force = false) => {
    if (!force && Date.now() - last.current < 10_000) return;
    last.current = Date.now();
    const r = (await fetch("/api/trophies", { cache: "no-store" }).then((x) => (x.ok ? x.json() : { ids: [] }), () => ({ ids: [] }))) as { ids: string[] };
    if (!r.ids.length) return;
    const fresh = r.ids.filter((id) => !queue.current.has(id));
    fresh.forEach((id) => queue.current.add(id));
    // Several at once (a first visit): one card for the lot, not a long row of toasts
    if (fresh.length) setQueue((q) => [...q, ...(fresh.length > 2 ? [fresh] : fresh.map((id) => [id]))]);
    void trophiesSeen(r.ids);
  }, []);

  useEffect(() => {
    void check();
  }, [path, check]);
  useEffect(() => {
    // A mark or a post lands in the database a moment after the click
    const soon = () => setTimeout(() => void check(true), 600);
    window.addEventListener("gf:progress", soon);
    return () => window.removeEventListener("gf:progress", soon);
  }, [check]);

  const batch = batches[0];
  const current = batch?.length === 1 ? batch[0] : null;
  useEffect(() => {
    if (!batch) return;
    const h = setTimeout(() => setQueue((q) => q.slice(1)), batch.length > 1 ? 7000 : 5200);
    return () => clearTimeout(h);
  }, [batch]);

  const def = current ? trophyById.get(current) : null;
  return (
    <AnimatePresence>
      {batch && batch.length > 1 && (
        <motion.div
          key={batch.join()}
          role="status"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[120] mx-auto max-w-md border-l-2 border-lime bg-ink-3/95 p-4 shadow-2xl backdrop-blur md:bottom-8"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-lime">{t("Trophées")}</p>
              <p className="font-display text-lg font-semibold leading-tight">{t("{n} trophées débloqués", { n: batch.length })}</p>
            </div>
            <button onClick={() => setQueue((q) => q.slice(1))} aria-label={t("Fermer")} className="text-dim hover:text-bone">
              <X size={16} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {batch.slice(0, 10).map((id, i) => (
              <motion.span key={id} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 400, damping: 14 }}>
                <TrophyBadge id={id} won size={34} />
              </motion.span>
            ))}
            <Link href="/me?tab=trophees" onClick={() => engage("trophy", "click", "batch")} className="ml-auto text-xs text-lime underline-offset-4 hover:underline">
              {t("Voir")}
            </Link>
          </div>
        </motion.div>
      )}
      {def && current && (
        <motion.div
          key={current}
          role="status"
          initial={{ y: 80, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-[120] mx-auto flex max-w-md items-center gap-4 border-l-2 bg-ink-3/95 p-4 shadow-2xl backdrop-blur md:bottom-8"
          style={{ borderColor: TIER_COLOR[def.tier] }}
        >
          <motion.span initial={{ rotate: -25, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.1 }}>
            <TrophyBadge id={current} won size={48} />
          </motion.span>
          {/* A short burst around the badge */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute left-10 top-1/2 size-1.5"
              style={{ background: TIER_COLOR[def.tier] }}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: Math.cos((i / 6) * Math.PI * 2) * 46, y: Math.sin((i / 6) * Math.PI * 2) * 46, opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
            />
          ))}
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: TIER_COLOR[def.tier] }}>
              {t("Trophée")} · {t(tierLabel[def.tier])}
            </p>
            <p className="font-display text-lg font-semibold leading-tight">{t(def.name)}</p>
            <p className="truncate text-xs text-dim">{t(def.hint)}</p>
          </div>
          <Link href="/me?tab=trophees" onClick={() => engage("trophy", "click", current)} className="shrink-0 text-xs text-lime underline-offset-4 hover:underline">
            {t("Voir")}
          </Link>
          <button onClick={() => setQueue((q) => q.slice(1))} aria-label={t("Fermer")} className="shrink-0 text-dim hover:text-bone">
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
