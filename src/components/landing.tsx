"use client";
import Link from "next/link";
import { useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { Kinetic, Glow } from "./kinetic";
import { VoiceStrip } from "./voice-strip";

function Magnetic({ children, href }: { children: React.ReactNode; href: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 20 });
  const sy = useSpring(y, { stiffness: 300, damping: 20 });
  return (
    <motion.div
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.35);
        y.set((e.clientY - r.top - r.height / 2) * 0.35);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      className="inline-block"
    >
      <Link
        href={href}
        className="notch group inline-flex h-16 items-center gap-3 bg-lime px-9 font-display text-lg font-semibold text-ink md:h-20 md:px-12 md:text-xl"
      >
        {children}
        <ArrowUpRight className="transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" />
      </Link>
    </motion.div>
  );
}

type Tile = { name: string; poster: string | null };

/** A poster, or the title set in type when there is no image (no TMDB key, blocked network, broken link). */
function WallTile({ t }: { t: Tile }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="relative aspect-[2/3] w-28 shrink-0 overflow-hidden bg-ink-3 md:w-40">
      {t.poster && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.poster} alt="" className="size-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <div className="flex size-full flex-col justify-end bg-gradient-to-br from-ink-3 to-ink p-3">
          <span className="line-clamp-4 break-words font-display text-sm font-extrabold leading-tight text-bone/80 [hyphens:auto] md:text-lg" lang="fr">{t.name}</span>
        </div>
      )}
    </div>
  );
}

// Shown when neither TMDB nor the local cache has anything yet (fresh install, blocked network)
const CLASSICS: Tile[] = [
  "Le Parrain", "Pulp Fiction", "Le Voyage de Chihiro", "La Haine", "Interstellar", "Parasite",
  "Intouchables", "Amélie Poulain", "Matrix", "Fight Club", "Inception", "Le Roi Lion",
  "Breaking Bad", "Arcane", "Lupin", "The Wire",
].map((name) => ({ name, poster: null }));

/** One endless row. The list is doubled and slid by half its width, so the loop has no seam. */
function Marquee({ items, reverse = false, seconds }: { items: Tile[]; reverse?: boolean; seconds: number }) {
  let half = items;
  while (half.length < 12) half = [...half, ...items];
  return (
    <div className="flex w-max gap-3 hover:[animation-play-state:paused] motion-safe:animate-marquee" style={{ animationDuration: `${seconds}s`, animationDirection: reverse ? "reverse" : "normal" }}>
      {[...half, ...half].map((t, i) => (
        <WallTile key={i} t={t} />
      ))}
    </div>
  );
}

function Wall({ tiles }: { tiles: Tile[] }) {
  const list = tiles.length ? tiles : CLASSICS;
  const rowA = list;
  const rowB = [...list].reverse();
  return (
    <div className="relative -mx-[10vw] my-24 -rotate-6 space-y-3 overflow-hidden py-6 md:my-32">
      <Marquee items={rowA} seconds={70} />
      <Marquee items={rowB} seconds={85} reverse />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink via-transparent to-ink" />
    </div>
  );
}

function Line({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.p
      initial={{ opacity: 0, x: -60 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className={`font-display font-extrabold leading-[0.9] tracking-tighter ${className}`}
    >
      {children}
    </motion.p>
  );
}

function Countdown() {
  return (
    <div className="relative grid size-56 place-items-center md:size-72">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgb(243 240 232 / .08)" strokeWidth="1.5" />
        <motion.circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="var(--color-lime)"
          strokeWidth="1.5"
          initial={{ pathLength: 1 }}
          whileInView={{ pathLength: 0.14 }}
          viewport={{ once: true }}
          transition={{ duration: 2.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="font-display text-7xl font-extrabold md:text-8xl">7J</span>
    </div>
  );
}

export function Landing({ tiles }: { tiles: Tile[] }) {
  return (
    <main className="relative overflow-x-clip">
      <Glow />
      <header className="relative z-10 flex items-center justify-between p-5 md:p-10">
        <span className="font-display text-xl font-extrabold">
          GABAOFLIX<span className="text-lime">.</span>
        </span>
        <Link href="/login" className="text-sm tracking-wide text-bone/70 underline-offset-8 hover:text-bone hover:underline">
          Connexion
        </Link>
      </header>

      <section className="relative z-10 px-5 pt-[8vh] md:px-10">
        <h1 className="font-display text-[15vw] font-extrabold leading-[0.85] tracking-tighter md:text-[11vw]">
          <Kinetic text="Gabao" />
          <Kinetic text="Flix" className="text-lime" delay={0.18} />
        </h1>
        <p className="mt-6 font-display text-[6vw] font-extrabold leading-[0.95] tracking-tight md:text-[3.2vw]">
          <span className="block"><Kinetic text="Tu demandes." delay={0.5} /></span>
          <span className="block"><Kinetic text="On upload." className="text-bone/30" delay={0.7} /></span>
          <span className="block"><Kinetic text="Tu regardes." className="text-lime" delay={0.9} /></span>
        </p>
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }} className="mt-10">
          <Magnetic href="/join">Entrer</Magnetic>
        </motion.div>
      </section>

      <Wall tiles={tiles} />

      <section className="relative z-10 px-5 md:px-10">
        <div className="space-y-2">
          <Line className="text-[13.5vw] md:text-[6.4vw]">0 nom.</Line>
          <Line className="text-[13.5vw] text-bone/25 md:text-[6.4vw]">0 IP.</Line>
          <Line className="text-[13.5vw] text-lime md:text-[6.4vw]">Mail chiffré.</Line>
        </div>
      </section>

      <div className="relative z-10 mt-32">
        <VoiceStrip big />
      </div>

      <section className="relative z-10 mt-40 flex flex-col items-center gap-12 px-5 pb-32 text-center md:flex-row md:justify-between md:px-10 md:text-left">
        <Countdown />
        <div className="space-y-10">
          <Line className="text-5xl md:text-7xl">Lien privé.</Line>
          <Magnetic href="/join">Commencer</Magnetic>
        </div>
      </section>
    </main>
  );
}
