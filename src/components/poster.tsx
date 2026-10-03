"use client";
import Link from "next/link";
import { motion } from "motion/react";

export type PosterData = {
  kind: string;
  tmdbId: number;
  name: string;
  year: number | null;
  poster: string | null;
  ready?: boolean;
};

export function Poster({ t, i = 0, size = "md" }: { t: PosterData; i?: number; size?: "md" | "lg" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: Math.min(i, 10) * 0.045, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={size === "lg" ? "w-44 shrink-0 snap-start md:w-56" : "w-32 shrink-0 snap-start md:w-44"}
    >
      <Link href={`/t/${t.kind}/${t.tmdbId}`} className="group block">
        <div className="relative aspect-[2/3] overflow-hidden bg-ink-3">
          {t.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.poster}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.06]"
            />
          ) : (
            <div className="grid size-full place-items-center bg-gradient-to-br from-ink-3 to-ink font-display text-6xl font-extrabold text-bone/10">
              {t.name.charAt(0)}
            </div>
          )}
          {t.ready && <span className="absolute inset-y-0 left-0 w-1 bg-lime" aria-label="Dispo" />}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="truncate text-sm">{t.name}</span>
          {t.year && <span className="shrink-0 font-mono text-[11px] text-dim">{t.year}</span>}
        </div>
      </Link>
    </motion.div>
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
