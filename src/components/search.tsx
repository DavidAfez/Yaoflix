"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Search as Icon, X, History } from "lucide-react";
import { Poster, type PosterData } from "./poster";
import { Dots } from "./ui";

type Person = { handle: string; seen: number; reviews: number };
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

/** Debounced TMDB search with filters and recent terms, shared by the home hero and the global overlay. */
function useTitleSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PosterData[] | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => setRecent(readRecent()), []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2 && term !== "@") {
      setResults(null);
      setPeople(null);
      return;
    }
    // A stale flag instead of AbortController: aborting an in-flight fetch surfaces as a runtime error in dev
    let stale = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = (await res.json()) as { results: PosterData[]; people?: Person[] };
        if (stale) return;
        setResults(data.results ?? []);
        setPeople(data.people ?? null);
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
  return { q, setQ, results, people, loading, filter, setFilter, recent, counts, shown };
}

type S = ReturnType<typeof useTitleSearch>;

function SearchBar({ s, input, focused, setFocused, onClose, big = true }: { s: S; input: React.RefObject<HTMLInputElement | null>; focused: boolean; setFocused: (b: boolean) => void; onClose?: () => void; big?: boolean }) {
  const showRecent = focused && !s.q && s.recent.length > 0;
  return (
    <>
      <form
        className={`flex items-center gap-4 ${big ? "h-20 md:h-24" : "h-16 md:h-20"}`}
        onSubmit={(e) => {
          e.preventDefault();
          input.current?.blur();
        }}
      >
        <Icon size={big ? 26 : 22} className="shrink-0 text-lime" />
        <input
          ref={input}
          value={s.q}
          onChange={(e) => s.setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Un film, une série, @membre"
          className={`w-full bg-transparent font-display font-semibold tracking-tight outline-none placeholder:text-bone/25 focus-visible:outline-none ${big ? "text-2xl md:text-4xl" : "text-xl md:text-3xl"}`}
          enterKeyHint="search"
          autoComplete="off"
          aria-label="Rechercher"
        />
        {s.loading && <Dots />}
        {s.q && !s.loading && (
          <motion.button type="button" initial={{ scale: 0 }} animate={{ scale: 1 }} onClick={() => s.setQ("")} aria-label="Effacer" className="text-dim hover:text-bone">
            <X size={22} />
          </motion.button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} className="shrink-0 border border-line px-3 py-1.5 text-sm text-dim hover:border-bone/40 hover:text-bone">
            Fermer
          </button>
        )}
      </form>

      <AnimatePresence initial={false}>
        {showRecent && (
          <motion.div key="recent" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="scrollbar-none flex items-center gap-2 overflow-x-auto pb-4">
              <History size={15} className="shrink-0 text-dim" aria-label="Récents" />
              {s.recent.map((r) => (
                <button key={r} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => s.setQ(r)} className="shrink-0 border border-line px-3 py-1.5 text-sm text-bone/80 hover:border-lime hover:text-lime">
                  {r}
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {s.results && s.results.length > 0 && (
          <motion.div key="filters" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="scrollbar-none flex gap-6 overflow-x-auto">
              {FILTERS.map((f) => {
                const on = s.filter === f.key;
                const n = s.counts[f.key];
                return (
                  <button
                    key={f.key}
                    type="button"
                    disabled={!n}
                    onClick={() => s.setFilter(f.key)}
                    className={`relative shrink-0 py-3 text-sm transition-colors disabled:opacity-30 ${on ? "text-bone" : "text-dim hover:text-bone"}`}
                  >
                    {f.key === "ready" && <span className="mr-1.5 inline-block h-2.5 w-1 bg-lime align-middle" />}
                    {f.label}
                    <span className="ml-1.5 font-mono text-[11px] tabular-nums text-lime">{n}</span>
                    {on && <motion.span layoutId={big ? "search-filter" : "search-filter-o"} className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Results({ s }: { s: S }) {
  if (!s.results) return null;
  if (s.people) return <People people={s.people} q={s.q} />;
  return (
    <div className="px-4 py-8 md:px-10">
      {s.results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-display text-4xl font-extrabold text-bone/15 md:text-6xl">Rien pour « {s.q.trim()} ».</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-6 md:gap-x-5 xl:grid-cols-8 [&>*]:w-auto">
          {s.shown.map((r, i) => (
            <Poster key={`${r.kind}${r.tmdbId}`} t={r} i={i} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Members found with "@": pseudonym and two counters, nothing else. */
function People({ people, q }: { people: Person[]; q: string }) {
  return (
    <div className="px-4 py-8 md:px-10">
      {people.length === 0 ? (
        <p className="py-20 text-center font-display text-4xl font-extrabold text-bone/15 md:text-6xl">Personne pour « {q.trim()} ».</p>
      ) : (
        <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p, i) => (
            <motion.li key={p.handle} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }} className="bg-ink">
              <Link href={`/u/${p.handle}`} className="group flex items-center gap-4 p-4 transition-colors hover:bg-ink-2">
                <span className="grid size-11 shrink-0 place-items-center bg-lime font-display text-lg font-extrabold uppercase text-ink">{p.handle.charAt(0)}</span>
                <span className="min-w-0 flex-1 truncate font-mono group-hover:text-lime">@{p.handle}</span>
                <span className="shrink-0 font-mono text-[11px] text-dim">
                  {p.seen} vus · {p.reviews} avis
                </span>
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

const typing = () => ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "");

export function SearchHero({ children }: { children: React.ReactNode }) {
  const s = useTitleSearch();
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !typing()) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    // The nav button on the home page focuses this bar instead of opening the overlay
    const onOpen = () => input.current?.focus();
    window.addEventListener("keydown", onKey);
    window.addEventListener("gf:search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("gf:search", onOpen);
    };
  }, []);

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-line bg-ink/85 px-4 backdrop-blur-xl md:top-16 md:px-10">
        <SearchBar s={s} input={input} focused={focused} setFocused={setFocused} />
      </div>
      <AnimatePresence mode="wait">
        {s.results ? (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Results s={s} />
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

/** Full-screen search reachable from every page through the nav, "/" or Ctrl+K. */
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useTitleSearch();
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const path = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Picking a result navigates: close behind it
  const first = useRef(path);
  useEffect(() => {
    if (path !== first.current) {
      first.current = path;
      onClose();
    }
  }, [path, onClose]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => input.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Recherche"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[80] overflow-y-auto bg-ink/97 backdrop-blur-xl"
        >
          <div className="sticky top-0 z-10 border-b border-line bg-ink/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:px-10">
            <SearchBar s={s} input={input} focused={focused} setFocused={setFocused} onClose={onClose} big={false} />
          </div>
          <Results s={s} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
