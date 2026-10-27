"use client";
import Link from "next/link";
import { motion } from "motion/react";

const TABS = [
  { k: "all", label: "Tout" },
  { k: "movie", label: "Films" },
  { k: "tv", label: "Séries" },
] as const;

export function KindTabs({ current }: { current: "all" | "movie" | "tv" }) {
  return (
    <nav className="mt-8 flex gap-8 px-4 md:px-10" aria-label="Catégories">
      {TABS.map((t) => {
        const on = t.k === current;
        return (
          <Link
            key={t.k}
            href={t.k === "all" ? "/" : `/?k=${t.k}`}
            scroll={false}
            className={`relative pb-2 font-display text-2xl font-extrabold tracking-tight transition-colors md:text-3xl ${on ? "text-bone" : "text-bone/25 hover:text-bone/60"}`}
          >
            {t.label}
            {on && <motion.span layoutId="kind-tab" className="absolute inset-x-0 -bottom-px h-1 bg-lime" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          </Link>
        );
      })}
    </nav>
  );
}
