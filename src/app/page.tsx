import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { cinephile, recommend } from "@/lib/recos";
import { trending, topRated, byGenre, byCountry, classics, interleave, localize, AFRICA, COUNTRY_ROWS, GENRE_ROWS, img, type TitleRow } from "@/lib/tmdb";
import { neverTitleIds } from "@/lib/marks";
import { getT } from "@/lib/i18n/server";
import { KindTabs } from "@/components/kind-tabs";
import { Billboard, type Slide } from "@/components/billboard";
import { readyTitleIds } from "@/lib/recos";
import { toPoster, daysLeft } from "@/lib/view";
import { Poster, Row } from "@/components/poster";
import { SearchHero } from "@/components/search";
import { Landing } from "@/components/landing";
import { StatusMark } from "@/components/status";

export default async function Page(props: PageProps<"/">) {
  const user = await getUser();
  if (!user) {
    let rows = await trending().catch(() => []);
    if (rows.length < 8) rows = [...rows, ...(await topRated("movie").catch(() => []))];
    rows = await localize(rows);
    const tiles = rows.slice(0, 16).map((t) => ({ name: t.name, poster: img(t.posterPath, "w342") }));
    return <Landing tiles={tiles} />;
  }
  if (!user.approved) redirect("/pending");

  const sp = await props.searchParams;
  const k: "all" | "movie" | "tv" = sp.k === "movie" || sp.k === "tv" ? sp.k : "all";
  const kindFilter = k === "all" ? undefined : k;
  // Genre rows: a handful of movie genres on "Tout", every genre of the chosen kind otherwise
  const genreRows: { kind: "movie" | "tv"; g: (typeof GENRE_ROWS)["movie"][number] }[] =
    k === "all" ? GENRE_ROWS.movie.slice(0, 4).map((g) => ({ kind: "movie", g })) : GENRE_ROWS[k].map((g) => ({ kind: k, g }));

  const rowKind: "movie" | "tv" = k === "tv" ? "tv" : "movie";
  const none = Promise.resolve([] as TitleRow[]);
  // eslint-disable-next-line prefer-const
  let [grants, myRequests, fresh, recos, topMovies, topShows, genres, countries, old, mine, never, [pref], listed] = await Promise.all([
    db
      .select({ grant: schema.accessGrants, title: schema.titles })
      .from(schema.accessGrants)
      .innerJoin(schema.media, eq(schema.media.id, schema.accessGrants.mediaId))
      .innerJoin(schema.titles, eq(schema.titles.id, schema.media.titleId))
      .where(
        and(
          eq(schema.accessGrants.userId, user.id),
          gt(schema.accessGrants.expiresAt, new Date()),
          isNull(schema.accessGrants.revokedAt),
          eq(schema.media.status, "READY"),
        ),
      )
      .orderBy(desc(schema.accessGrants.createdAt))
      .limit(10),
    db
      .select({ req: schema.requests, title: schema.titles })
      .from(schema.requests)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.requests.titleId))
      .where(and(eq(schema.requests.userId, user.id)))
      .orderBy(desc(schema.requests.createdAt))
      .limit(12),
    db
      .selectDistinctOn([schema.media.titleId], { title: schema.titles, readyAt: schema.media.readyAt })
      .from(schema.media)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.media.titleId))
      .where(and(eq(schema.media.status, "READY"), kindFilter ? eq(schema.titles.kind, kindFilter) : undefined))
      .orderBy(schema.media.titleId, desc(schema.media.readyAt))
      .limit(30),
    recommend(user, 18, kindFilter),
    k === "tv" ? Promise.resolve([] as TitleRow[]) : topRated("movie").catch(() => [] as TitleRow[]),
    k === "movie" ? Promise.resolve([] as TitleRow[]) : topRated("tv").catch(() => [] as TitleRow[]),
    // Each genre row also carries a few African productions
    Promise.all(
      genreRows.map(async ({ kind, g }) => {
        const [base, african] = await Promise.all([byGenre(kind, g).catch(() => [] as TitleRow[]), byCountry(kind, AFRICA, { genre: g.id, limit: 6 })]);
        return { name: g.name, items: interleave(base, african) };
      }),
    ),
    Promise.all(COUNTRY_ROWS.map(async (c) => ({ name: c.name, items: await byCountry(rowKind, c.codes) }))),
    k === "tv" ? none : classics("movie").catch(() => [] as TitleRow[]),
    k === "tv" ? none : cinephile(user, 18).catch(() => [] as TitleRow[]),
    neverTitleIds(user.id),
    db.select({ ms: schema.users.billboardMs }).from(schema.users).where(eq(schema.users.id, user.id)),
    db.select({ id: schema.watchlist.titleId }).from(schema.watchlist).where(eq(schema.watchlist.userId, user.id)),
  ]);
  const listedIds = new Set(listed.map((l) => l.id));
  const t = await getT();
  // Titles the member refuses to watch never show up in a row
  const keep = (rows: TitleRow[]) => rows.filter((t) => !never.has(t.id));
  // Names and synopses in the member's language, fetched in one batch
  const lang = new Map(
    (
      await localize([
        ...recos, ...topMovies, ...topShows, ...old, ...mine,
        ...genres.flatMap((r) => r.items), ...countries.flatMap((r) => r.items),
        ...fresh.map((f) => f.title), ...grants.map((g) => g.title), ...myRequests.map((r) => r.title),
      ])
    ).map((t) => [t.id, t]),
  );
  const loc = <T extends TitleRow>(t: T): T => (lang.get(t.id) as T | undefined) ?? t;
  [recos, topMovies, topShows, old, mine] = [recos, topMovies, topShows, old, mine].map((l) => l.map(loc));
  genres = genres.map((r) => ({ ...r, items: r.items.map(loc) }));
  countries = countries.map((r) => ({ ...r, items: r.items.map(loc) }));
  fresh = fresh.map((f) => ({ ...f, title: loc(f.title) }));
  grants = grants.map((g) => ({ ...g, title: loc(g.title) }));
  myRequests = myRequests.map((r) => ({ ...r, title: loc(r.title) }));
  const topReady = await readyTitleIds(
    [...topMovies, ...topShows, ...recos, ...old, ...mine, ...genres.flatMap((r) => r.items), ...countries.flatMap((r) => r.items)].map((t) => t.id),
  );
  // Billboard: the best recommendations that have a backdrop, then classics picked for this member
  const slides: Slide[] = [...new Map([...keep(recos), ...keep(mine), ...keep(topMovies)].filter((t) => t.backdropPath).map((t) => [t.id, t])).values()]
    .slice(0, 6)
    .map((t) => ({
      id: t.id,
      listed: listedIds.has(t.id),
      kind: t.kind,
      tmdbId: t.tmdbId,
      name: t.name,
      year: t.year,
      overview: t.overview,
      backdrop: img(t.backdropPath, "w1280")!,
      genres: t.genres,
      ready: topReady.has(t.id),
      vote: t.voteAverage,
    }));
  const latest = fresh.sort((a, b) => (b.readyAt?.getTime() ?? 0) - (a.readyAt?.getTime() ?? 0)).slice(0, 16);

  return (
    <main>
      <SearchHero>
        <Billboard slides={slides} delay={pref?.ms ?? 3000} />
        <KindTabs current={k} />

        {grants.length > 0 && (
          <section className="mx-4 mt-10 md:mx-10">
            <div className="scrollbar-none flex snap-x gap-3 overflow-x-auto">
              {grants.map(({ grant, title }) => (
                <Link
                  key={grant.id}
                  href={`/w/${grant.id}`}
                  className="group relative h-44 w-[82vw] shrink-0 snap-start overflow-hidden bg-ink-3 md:h-56 md:w-[480px]"
                >
                  {title.backdropPath && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img(title.backdropPath, "w780")!} alt="" className="absolute inset-0 size-full object-cover opacity-70 transition-transform duration-700 group-hover:scale-105" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-tr from-ink via-ink/40 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5">
                    <div>
                      <p className="font-display text-xl font-semibold leading-tight md:text-2xl">{title.name}</p>
                      <p className="mt-1 font-mono text-xs text-lime">J-{daysLeft(grant.expiresAt)}</p>
                    </div>
                    <span className="grid size-12 shrink-0 place-items-center rounded-full bg-lime text-ink transition-transform group-hover:scale-110">
                      <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor"><path d="M0 0l16 9-16 9z" /></svg>
                    </span>
                  </div>
                  {grant.lastPositionSec > 0 && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-lime/70" />}
                </Link>
              ))}
            </div>
          </section>
        )}

        {recos.length > 0 && (
          <Row title="Pour toi">
            {keep(recos).map((t, i) => (
              <Poster key={t.id} t={toPoster(t, topReady.has(t.id))} i={i} size="lg" hideNever />
            ))}
          </Row>
        )}

        {latest.length > 0 && (
          <Row title="Arrivés" count={latest.length}>
            {latest.filter(({ title }) => !never.has(title.id)).map(({ title }, i) => (
              <Poster key={title.id} t={toPoster(title, true)} i={i} hideNever />
            ))}
          </Row>
        )}

        {k === "all" && myRequests.length > 0 && (
          <section className="mt-14 px-4 md:px-10">
            <h2 className="mb-4 font-display text-xl font-semibold md:text-2xl">{t("Demandes")}</h2>
            <ul className="divide-y divide-line border-y border-line">
              {myRequests.map(({ req, title }) => (
                <li key={req.id}>
                  <Link href={`/t/${title.kind}/${title.tmdbId}`} className="flex items-center gap-4 py-3 transition-colors hover:bg-ink-2">
                    {title.posterPath && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img(title.posterPath, "w342")!} alt="" className="h-14 w-10 object-cover" />
                    )}
                    <span className="flex-1 truncate">{title.name}</span>
                    <StatusMark status={req.status} reason={req.rejectReason} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!grants.length && !recos.length && !latest.length && !myRequests.length && !topMovies.length && !topShows.length && !genres.some((r) => r.items.length) && (
          <div className="grid min-h-[40vh] place-items-center px-6 text-center">
            <p className="font-display text-5xl font-extrabold leading-none text-bone/15 md:text-8xl">{t("Cherche.")}<br />{t("Demande.")}<br />{t("Regarde.")}</p>
          </div>
        )}

        {mine.length > 0 && (
          <Row title="Ta cinéphilie">
            {keep(mine).map((t, i) => (
              <Poster key={t.id} t={toPoster(t, topReady.has(t.id))} i={i} hideNever />
            ))}
          </Row>
        )}

        {old.length > 0 && (
          <Row title="Grands classiques">
            {keep(old).map((t, i) => (
              <Poster key={t.id} t={toPoster(t, topReady.has(t.id))} i={i} hideNever />
            ))}
          </Row>
        )}

        {topMovies.length > 0 && (
          <Row title="Top films">
            {keep(topMovies).map((t, i) => (
              <Poster key={t.id} t={toPoster(t, topReady.has(t.id))} i={i} hideNever />
            ))}
          </Row>
        )}

        {topShows.length > 0 && (
          <Row title="Top séries">
            {keep(topShows).map((t, i) => (
              <Poster key={t.id} t={toPoster(t, topReady.has(t.id))} i={i} hideNever />
            ))}
          </Row>
        )}

        {countries
          .filter((r) => r.items.length > 0)
          .map((r) => (
            <Row key={`c-${r.name}`} title={r.name}>
              {keep(r.items).map((t, i) => (
                <Poster key={t.id} t={toPoster(t, topReady.has(t.id))} i={i} hideNever />
              ))}
            </Row>
          ))}

        {genres
          .filter((r) => r.items.length > 0)
          .map((r) => (
            <Row key={r.name} title={r.name}>
              {keep(r.items).map((t, i) => (
                <Poster key={t.id} t={toPoster(t, topReady.has(t.id))} i={i} hideNever />
              ))}
            </Row>
          ))}

        <div className="h-16" />
      </SearchHero>
    </main>
  );
}
