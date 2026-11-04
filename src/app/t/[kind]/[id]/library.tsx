import type { TitleDetails } from "@/db/schema";
import { getT } from "@/lib/i18n/server";
import { timecode } from "@/lib/notes";

/** An album's tracklist, or a book's facts, with a link to the source page. */
export async function LibraryDetails({ kind, details }: { kind: "album" | "book"; details: TitleDetails | null }) {
  const t = await getT();
  if (!details) return null;
  const tracks = details.tracks ?? [];
  const facts = (
    [
      ["Label", details.label],
      ["Éditeur", details.publisher],
      ["Pages", details.pages ? String(details.pages) : null],
    ] as [string, string | null | undefined][]
  ).filter((f): f is [string, string] => Boolean(f[1]));
  if (!tracks.length && !facts.length && !details.link) return null;
  return (
    <section className="mx-4 mt-12 md:mx-10">
      {tracks.length > 0 && (
        <>
          <h2 className="mb-5 font-display text-xl font-semibold tracking-tight md:text-2xl">{t("Titres")}</h2>
          <ol className="max-w-2xl divide-y divide-line border-y border-line">
            {tracks.map((x) => (
              <li key={x.n} className="flex items-center gap-4 py-3">
                <span className="w-6 shrink-0 text-right font-mono text-xs text-dim">{x.n}</span>
                <span className="min-w-0 flex-1 truncate">{x.title}</span>
                {x.sec != null && <span className="shrink-0 font-mono text-xs tabular-nums text-dim">{timecode(x.sec)}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
      {facts.length > 0 && (
        <dl className="mt-8 grid max-w-2xl gap-x-10 gap-y-4 sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-lime">{t(label)}</dt>
              <dd className="mt-1">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {details.link && (
        <a href={details.link} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block text-sm text-dim underline-offset-4 hover:text-lime hover:underline">
          {t(kind === "album" ? "Écouter sur Deezer" : "Voir sur Open Library")} ↗
        </a>
      )}
    </section>
  );
}
