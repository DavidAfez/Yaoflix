"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search as Icon, X } from "lucide-react";
import { Poster, type PosterData } from "./poster";
import { Dots } from "./ui";

export function SearchHero({ children }: { children: React.ReactNode }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PosterData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    // A stale flag instead of AbortController: aborting an in-flight fetch surfaces as a runtime error in dev
    let stale = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as { results: PosterData[] };
        if (!stale) setResults(data.results ?? []);
      } catch {
      } finally {
        if (!stale) setLoading(false);
      }
    }, 280);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-line bg-ink/85 px-4 backdrop-blur-xl md:top-16 md:px-10">
        <label className="flex h-20 items-center gap-4 md:h-24">
          <Icon size={26} className="shrink-0 text-lime" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Un film, une série"
            className="w-full bg-transparent font-display text-2xl font-semibold tracking-tight outline-none placeholder:text-bone/25 md:text-4xl"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Rechercher"
          />
          {loading && <Dots />}
          {q && !loading && (
            <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} onClick={() => setQ("")} aria-label="Effacer" className="text-dim hover:text-bone">
              <X size={22} />
            </motion.button>
          )}
        </label>
      </div>

      <AnimatePresence mode="wait">
        {results ? (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-4 py-8 md:px-10">
            {results.length === 0 ? (
              <p className="py-20 text-center font-display text-3xl text-bone/30">Rien.</p>
            ) : (
              <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-6 md:gap-x-5 xl:grid-cols-8 [&>*]:w-auto">
                {results.map((r, i) => (
                  <Poster key={`${r.kind}${r.tmdbId}`} t={r} i={i} />
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
