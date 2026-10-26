"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Search as Icon, X, History } from "lucide-react";
import { Poster, type PosterData } from "./poster";
import { Dots } from "./ui";

type Filter = "all" | "movie" | "tv" | "ready";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "movie", label: "Films" },
  { key: "tv", label: "Séries" },
  { key: "ready", label: "Dispo" },
];
const RECENT_KEY = "gf_recent";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function pushRecent(term: string) {
  try {
    const next = [term, ...readRecent().filter((t) => t.toLowerCase() !== term.toLowerCase())].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export function SearchHero({ children }: { children: React.ReactNode }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PosterData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setRecent(readRecent()), []);

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
        if (stale) return;
        setResults(data.results ?? []);
        setFilter("all");
        if (data.results?.length) setRecent(pushRecent(term));
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

  // Titles already online first, then the rest in relevance order
  const sorted = useMemo(() => (results ? [...results].sort((a, b) => Number(Boolean(b.ready)) - Number(Boolean(a.ready))) : []), [results]);
  const counts = useMemo(
    () => ({
      all: sorted.length,
      movie: sorted.filter((r) => r.kind === "movie").length,
      tv: sorted.filter((r) => r.kind === "tv").length,
      ready: sorted.filter((r) => r.ready).length,
    }),
    [sorted],
  );
  const shown = sorted.filter((r) => filter === "all" || (filter === "ready" ? r.ready : r.kind === filter));
  const showRecent = focused && !q && recent.length > 0;

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-line bg-ink/85 px-4 backdrop-blur-xl md:top-16 md:px-10">
        <form
          className="flex h-20 items-center gap-4 md:h-24"
          onSubmit={(e) => {
            e.preventDefault();
            input.current?.blur();
          }}
        >
          <Icon size={26} className="shrink-0 text-lime" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Un film, une série"
            className="w-full bg-transparent font-display text-2xl font-semibold tracking-tight outline-none placeholder:text-bone/25 focus-visible:outline-none md:text-4xl"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Rechercher"
          />
          {loading && <Dots />}
          {q && !loading && (
            <motion.button type="button" initial={{ scale: 0 }} animate={{ scale: 1 }} onClick={() => setQ("")} aria-label="Effacer" className="text-dim hover:text-bone">
              <X size={22} />
            </motion.button>
          )}
        </form>

        <AnimatePresence initial={false}>
          {showRecent && (
            <motion.div key="recent" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="scrollbar-none flex items-center gap-2 overflow-x-auto pb-4">
                <History size={15} className="shrink-0 text-dim" aria-label="Récents" />
                {recent.map((r) => (
                  <button key={r} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQ(r)} className="shrink-0 border border-line px-3 py-1.5 text-sm text-bone/80 hover:border-lime hover:text-lime">
                    {r}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
          {results && results.length > 0 && (
            <motion.div key="filters" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="scrollbar-none flex gap-6 overflow-x-auto">
                {FILTERS.map((f) => {
                  const on = filter === f.key;
                  const n = counts[f.key];
                  return (
                    <button
                      key={f.key}
                      type="button"
                      disabled={!n}
                      onClick={() => setFilter(f.key)}
                      className={`relative shrink-0 py-3 text-sm transition-colors disabled:opacity-30 ${on ? "text-bone" : "text-dim hover:text-bone"}`}
                    >
                      {f.key === "ready" && <span className="mr-1.5 inline-block h-2.5 w-1 bg-lime align-middle" />}
                      {f.label}
                      <span className="ml-1.5 font-mono text-[11px] tabular-nums text-lime">{n}</span>
                      {on && <motion.span layoutId="search-filter" className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {results ? (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-4 py-8 md:px-10">
            {results.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <p className="font-display text-4xl font-extrabold text-bone/15 md:text-6xl">Rien pour « {q.trim()} ».</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-6 md:gap-x-5 xl:grid-cols-8 [&>*]:w-auto">
                {shown.map((r, i) => (
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
