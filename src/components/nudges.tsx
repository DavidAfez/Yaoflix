"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, X } from "lucide-react";
import type { Nudges } from "@/lib/nudges";
import { trophyById } from "@/lib/trophy-defs";
import { useT } from "./i18n";
import { engage, engageShownOnce } from "./engage";
import { TrophyBadge, TIER_COLOR } from "./trophies";

/** Counts a nudge as shown once it is actually on screen. */
function useShown(feature: "welcome" | "pick" | "near", key: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        engageShownOnce(feature, key);
        io.disconnect();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [feature, key]);
  return ref;
}

/** The home page's quiet nudges: what happened while away, the pick of the day, a trophy within reach. */
export function HomeNudges({ n }: { n: Nudges }) {
  if (!n.welcome && !n.pick && !n.near) return null;
  return (
    <section className="mx-4 mt-8 space-y-3 md:mx-10">
      {n.welcome && <Welcome w={n.welcome} />}
      {(n.pick || n.near) && (
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {n.pick && <Pick p={n.pick} />}
          {n.near && <Near near={n.near} />}
        </div>
      )}
    </section>
  );
}

function Welcome({ w }: { w: NonNullable<Nudges["welcome"]> }) {
  const t = useT();
  const ref = useShown("welcome", null);
  const [open, setOpen] = useState(true);
  const items = [
    w.ready > 0 && { href: "/list", text: t(w.ready > 1 ? "{n} titres de ta liste sont prêts" : "{n} titre de ta liste est prêt", { n: w.ready }) },
    w.followers > 0 && { href: "/me", text: t(w.followers > 1 ? "{n} nouveaux abonnés" : "{n} nouvel abonné", { n: w.followers }) },
    w.trophies > 0 && { href: "/feed", text: t(w.trophies > 1 ? "{n} trophées gagnés par ceux que tu suis" : "{n} trophée gagné par quelqu'un que tu suis", { n: w.trophies }) },
    w.posts > 0 && { href: "/feed", text: t(w.posts > 1 ? "{n} posts dans le feed" : "{n} post dans le feed", { n: w.posts }) },
  ].filter((x): x is { href: string; text: string } => Boolean(x));
  return (
    <AnimatePresence>
      {open && (
        <motion.div ref={ref} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="relative border-l-2 border-lime bg-ink-2 p-4 pr-10">
          <p className="font-display font-semibold">{t("Pendant ces {d} jours", { d: w.days })}</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {items.map((it) => (
              <li key={it.text}>
                <Link href={it.href} onClick={() => engage("welcome", "click", it.href)} className="text-dim underline-offset-4 transition-colors hover:text-lime hover:underline">
                  {it.text}
                </Link>
              </li>
            ))}
          </ul>
          <button onClick={() => setOpen(false)} aria-label={t("Fermer")} className="absolute right-3 top-3 text-dim hover:text-bone">
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Pick({ p }: { p: NonNullable<Nudges["pick"]> }) {
  const t = useT();
  const key = `${p.kind}:${p.tmdbId}`;
  const ref = useShown("pick", key);
  return (
    <motion.div ref={ref} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Link
        href={`/t/${p.kind}/${p.tmdbId}`}
        onClick={() => engage("pick", "click", key)}
        className="group relative flex h-36 items-end overflow-hidden bg-ink-3 md:h-40"
      >
        {(p.backdrop ?? p.poster) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={(p.backdrop ?? p.poster)!} alt="" className="absolute inset-0 size-full object-cover opacity-60 transition-transform duration-700 group-hover:scale-105" />
        )}
        <span className="absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-transparent" />
        <span className="relative flex w-full items-end justify-between gap-4 p-4">
          <span className="min-w-0">
            <span className="block font-mono text-[10px] uppercase tracking-widest text-lime">{t("Le choix du jour")}</span>
            <span className="mt-1 block truncate font-display text-xl font-semibold leading-tight">{p.name}</span>
            <span className="block text-xs text-dim">
              {[p.year, t(p.why === "ready" ? "Prêt à regarder" : "Dans tes goûts")].filter(Boolean).join(" · ")}
            </span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-lime transition-transform group-hover:translate-x-1" />
        </span>
      </Link>
    </motion.div>
  );
}

function Near({ near }: { near: NonNullable<Nudges["near"]> }) {
  const t = useT();
  const ref = useShown("near", near.id);
  const def = trophyById.get(near.id);
  if (!def) return null;
  const left = near.need - near.have;
  return (
    <motion.div ref={ref} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Link
        href="/me?tab=trophees"
        onClick={() => engage("near", "click", near.id)}
        className="flex h-full items-center gap-4 border border-line p-4 transition-colors hover:border-bone/30"
      >
        <TrophyBadge id={near.id} won={false} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">
            {t("Plus que {n} pour", { n: left })} <span className="font-semibold">{t(def.name)}</span>
          </span>
          <span className="mt-2 block h-1 bg-bone/10">
            <span className="block h-full" style={{ width: `${(near.have / near.need) * 100}%`, background: TIER_COLOR[def.tier] }} />
          </span>
        </span>
      </Link>
    </motion.div>
  );
}
