"use client";
import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Search } from "lucide-react";
import { Poster, type PosterData } from "./poster";
import { UnlistedSheet } from "./unlisted";
import { useT } from "./i18n";
import { Dots } from "./ui";

/** Search one shelf (albums or books); nothing found, the member adds it with its cover. */
export function LibrarySearch({ kind }: { kind: "album" | "book" }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PosterData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return setResults(null);
    let stale = false;
    const h = setTimeout(async () => {
      setLoading(true);
      const r = (await fetch(`/api/search?type=${kind}&q=${encodeURIComponent(q.trim())}`).then((x) => x.json()).catch(() => ({ results: [] }))) as { results: PosterData[] };
      if (stale) return;
      setResults(r.results ?? []);
      setLoading(false);
    }, 300);
    return () => {
      stale = true;
      clearTimeout(h);
    };
  }, [q, kind]);

  return (
    <section className="px-4 pt-8 md:px-10">
      <label className="flex max-w-xl items-center gap-3 border-b border-line pb-3 focus-within:border-lime">
        <Search size={20} className="text-lime" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(kind === "album" ? "Un album, un artiste" : "Un livre, un auteur")} className="w-full bg-transparent text-xl outline-none placeholder:text-bone/25" />
        {loading && <Dots />}
      </label>
      {results && (
        <div className="py-8">
          {results.length > 0 && (
            <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-6 md:gap-x-5 xl:grid-cols-8 [&>*]:w-auto">
              {results.map((r, i) => (
                <Poster key={`${r.kind}${r.tmdbId}`} t={r} i={i} />
              ))}
            </div>
          )}
          <p className={`text-sm text-dim ${results.length ? "mt-10 text-center" : ""}`}>
            {t(results.length ? "Pas le bon ?" : "Rien trouvé.")}{" "}
            <button onClick={() => setAdding(true)} className="text-lime underline-offset-4 hover:underline">
              {t(kind === "album" ? "Ajouter cet album" : "Ajouter ce livre")}
            </button>
          </p>
        </div>
      )}
      <AnimatePresence>{adding && <UnlistedSheet initial={q.trim()} kind={kind} onClose={() => setAdding(false)} />}</AnimatePresence>
    </section>
  );
}
