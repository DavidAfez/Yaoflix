"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Heart, Info, Play } from "lucide-react";
import { useMark } from "./marks";

export type Slide = {
  kind: string;
  tmdbId: number;
  name: string;
  year: number | null;
  overview: string | null;
  backdrop: string;
  genres: string[];
  ready: boolean;
  vote: number | null;
};

const EASE = [0.22, 1, 0.36, 1] as const;
const DELAY = 7000;

/** Big recommendation carousel at the top of the home page. Rotates alone, pauses on hover, swipes on mobile. */
export function Billboard({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const go = useCallback((n: number) => setI((n + slides.length) % slides.length), [slides.length]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const t = setTimeout(() => go(i + 1), DELAY);
    return () => clearTimeout(t);
  }, [i, paused, go, slides.length]);

  if (!slides.length) return null;
  const s = slides[i];

  return (
    <section
      className="relative h-[62svh] min-h-[420px] overflow-hidden md:h-[72vh]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carrousel"
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={s.tmdbId + s.kind}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 1.08 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: EASE }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (info.offset.x < -60) go(i + 1);
            else if (info.offset.x > 60) go(i - 1);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.backdrop} alt="" className="pointer-events-none size-full object-cover" draggable={false} />
        </motion.div>
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/0" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/30 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 px-4 pb-10 md:px-10 md:pb-14">
        <AnimatePresence mode="wait">
          <motion.div key={s.tmdbId + s.kind} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.6, ease: EASE }} className="max-w-2xl">
            <p className="flex flex-wrap gap-x-4 font-mono text-xs uppercase tracking-wider text-bone/70">
              {s.year && <span>{s.year}</span>}
              {s.kind === "tv" && <span>Série</span>}
              {s.genres.slice(0, 2).map((g) => (
                <span key={g}>{g}</span>
              ))}
              {s.vote ? <span className="text-lime">★ {s.vote.toFixed(1)}</span> : null}
            </p>
            <h2 className="mt-3 font-display text-4xl font-extrabold leading-[0.95] tracking-tight md:text-7xl">{s.name}</h2>
            {s.overview && <p className="mt-4 line-clamp-2 max-w-xl text-bone/80 md:line-clamp-3">{s.overview}</p>}
            <Actions s={s} />
          </motion.div>
        </AnimatePresence>
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-4 right-4 flex gap-1.5 md:bottom-8 md:right-10">
          {slides.map((x, n) => (
            <button key={x.tmdbId + x.kind} onClick={() => go(n)} aria-label={x.name} className="relative h-1 w-6 overflow-hidden bg-bone/20 md:w-10">
              {n === i && (
                <motion.span
                  key={`${i}-${paused}`}
                  className="absolute inset-y-0 left-0 bg-lime"
                  initial={{ width: paused ? "100%" : "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: paused ? 0 : DELAY / 1000, ease: "linear" }}
                />
              )}
              {n < i && <span className="absolute inset-0 bg-bone/60" />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Actions({ s }: { s: Slide }) {
  const mark = useMark(s);
  return (
    <div className="mt-6 flex items-center gap-2">
      <Link href={`/t/${s.kind}/${s.tmdbId}`} className="notch flex h-12 items-center gap-2 bg-lime px-6 font-semibold text-ink transition-transform hover:scale-[1.03]">
        {s.ready ? <Play size={18} fill="currentColor" /> : <Info size={18} />}
        {s.ready ? "Regarder" : "Voir"}
      </Link>
      {mark && (
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={mark.toggleLike}
          aria-label="J'aime"
          aria-pressed={mark.liked}
          className={`grid size-12 place-items-center border bg-ink/40 backdrop-blur transition-colors ${mark.liked ? "border-coral text-coral" : "border-bone/30 hover:border-bone"}`}
        >
          <Heart size={20} fill={mark.liked ? "currentColor" : "none"} />
        </motion.button>
      )}
    </div>
  );
}
