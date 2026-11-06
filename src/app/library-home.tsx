import { KindTabs } from "@/components/kind-tabs";
import { Poster, Row } from "@/components/poster";
import { LibrarySearch } from "@/components/library-search";
import { memberShelf, trendingLibrary, type LibraryKind } from "@/lib/library";
import { readyTitleIds } from "@/lib/recos";
import { toPoster } from "@/lib/view";
import { getT } from "@/lib/i18n/server";

/** The music or book shelf: a search, what the members like, and what's popular out there. */
export async function LibraryHome({ kind }: { kind: LibraryKind }) {
  const t = await getT();
  const [trend, { top, recent }] = await Promise.all([trendingLibrary(kind), memberShelf(kind)]);
  const ready = await readyTitleIds([]);
  const p = (x: (typeof trend)[number]) => toPoster(x, ready.has(x.id));
  return (
    <main className="pb-24">
      <h1 className="sr-only">{t(kind === "album" ? "Musique" : "Livres")}</h1>
      <KindTabs current={kind} />
      <LibrarySearch kind={kind} />
      {top.length > 0 && (
        <Row title="Les membres adorent">
          {top.map((x, i) => (
            <Poster key={x.id} t={p(x)} i={i} />
          ))}
        </Row>
      )}
      {trend.length > 0 && (
        <Row title={kind === "album" ? "En ce moment sur Deezer" : "Lus en ce moment"}>
          {trend.map((x, i) => (
            <Poster key={x.id} t={p(x)} i={i} />
          ))}
        </Row>
      )}
      {recent.length > 0 && (
        <Row title="Vus passer récemment">
          {recent.map((x, i) => (
            <Poster key={x.id} t={p(x)} i={i} />
          ))}
        </Row>
      )}
      {!top.length && !trend.length && !recent.length && (
        <p className="px-4 py-16 font-display text-3xl font-extrabold text-bone/15 md:px-10 md:text-5xl">{t(kind === "album" ? "Cherche un album." : "Cherche un livre.")}</p>
      )}
    </main>
  );
}
