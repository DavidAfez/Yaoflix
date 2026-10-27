import Link from "next/link";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { recommend } from "@/lib/recos";
import { trending, topRated, byGenre, GENRE_ROWS, img, type TitleRow } from "@/lib/tmdb";
import { KindTabs } from "@/components/kind-tabs";
import { readyTitleIds } from "@/lib/recos";
import { VoiceStrip } from "@/components/voice-strip";
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
    const tiles = rows.slice(0, 16).map((t) => ({ name: t.name, poster: img(t.posterPath, "w342") }));
    return <Landing tiles={tiles} />;
  }

  const sp = await props.searchParams;
  const k: "all" | "movie" | "tv" = sp.k === "movie" || sp.k === "tv" ? sp.k : "all";
  const kindFilter = k === "all" ? undefined : k;
  // Genre rows: a handful of movie genres on "Tout", every genre of the chosen kind otherwise
  const genreRows: { kind: "movie" | "tv"; g: (typeof GENRE_ROWS)["movie"][number] }[] =
    k === "all" ? GENRE_ROWS.movie.slice(0, 4).map((g) => ({ kind: "movie", g })) : GENRE_ROWS[k].map((g) => ({ kind: k, g }));

  const [grants, myRequests, fresh, recos, topMovies, topShows, genres] = await Promise.all([
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
    Promise.all(genreRows.map(async ({ kind, g }) => ({ name: g.name, items: await byGenre(kind, g).catch(() => [] as TitleRow[]) }))),
  ]);
  const topReady = await readyTitleIds([...topMovies, ...topShows, ...recos, ...genres.flatMap((r) => r.items)].map((t) => t.id));
  const latest = fresh.sort((a, b) => (b.readyAt?.getTime() ?? 0) - (a.readyAt?.getTime() ?? 0)).slice(0, 16);

  return (
    <main>
      <SearchHero>
        <KindTabs current={k} />

        {grants.length > 0 && (
          <section className="mt-10 px-4 md:px-10">
            <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 md:mx-0 md:px-0">
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
            {recos.map((t, i) => (
              <Poster key={t.id} t={toPoster(t, topReady.has(t.id))} i={i} size="lg" />
            ))}
          </Row>
        )}

        {latest.length > 0 && (
          <Row title="Arrivés" count={latest.length}>
            {latest.map(({ title }, i) => (
              <Poster key={title.id} t={toPoster(title, true)} i={i} />
            ))}
          </Row>
        )}

        {k === "all" && myRequests.length > 0 && (
          <section className="mt-14 px-4 md:px-10">
            <h2 className="mb-4 font-display text-xl font-semibold md:text-2xl">Demandes</h2>
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
            <p className="font-display text-5xl font-extrabold leading-none text-bone/15 md:text-8xl">Cherche.<br />Demande.<br />Regarde.</p>
          </div>
        )}

        <VoiceStrip />

        {topMovies.length > 0 && (
          <Row title="Top films">
            {topMovies.map((t, i) => (
              <Poster key={t.id} t={toPoster(t, topReady.has(t.id))} i={i} />
            ))}
          </Row>
        )}

        {topShows.length > 0 && (
          <Row title="Top séries">
            {topShows.map((t, i) => (
              <Poster key={t.id} t={toPoster(t, topReady.has(t.id))} i={i} />
            ))}
          </Row>
        )}

        {genres
          .filter((r) => r.items.length > 0)
          .map((r) => (
            <Row key={r.name} title={r.name}>
              {r.items.map((t, i) => (
                <Poster key={t.id} t={toPoster(t, topReady.has(t.id))} i={i} />
              ))}
            </Row>
          ))}

        <div className="h-16" />
      </SearchHero>
    </main>
  );
}
