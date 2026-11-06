"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { useT } from "./i18n";

const TABS = [
  { k: "all", label: "Tout" },
  { k: "movie", label: "Films" },
  { k: "tv", label: "Séries" },
  { k: "album", label: "Musique" },
  { k: "book", label: "Livres" },
] as const;

export function KindTabs({ current }: { current: "all" | "movie" | "tv" | "album" | "book" }) {
  const tr = useT();
  return (
    <nav className="scrollbar-none mt-8 flex gap-6 overflow-x-auto px-4 md:gap-8 md:px-10" aria-label={tr("Catégories")}>
      {TABS.map((t) => {
        const on = t.k === current;
        return (
          <Link
            key={t.k}
            href={t.k === "all" ? "/" : `/?k=${t.k}`}
            scroll={false}
            className={`relative shrink-0 pb-2 font-display text-2xl font-extrabold tracking-tight transition-colors md:text-3xl ${on ? "text-bone" : "text-bone/45 hover:text-bone/70"}`}
          >
            {tr(t.label)}
            {on && <motion.span layoutId="kind-tab" className="absolute inset-x-0 -bottom-px h-1 bg-lime" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          </Link>
        );
      })}
    </nav>
  );
}
