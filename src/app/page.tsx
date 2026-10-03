import Link from "next/link";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { recommend } from "@/lib/recos";
import { trending, img } from "@/lib/tmdb";
import { toPoster, daysLeft } from "@/lib/view";
import { Poster, Row } from "@/components/poster";
import { SearchHero } from "@/components/search";
import { Landing } from "@/components/landing";
import { StatusMark } from "@/components/status";

export default async function Page() {
  const user = await getUser();
  if (!user) {
    const posters = (await trending().catch(() => []))
      .map((t) => img(t.posterPath, "w342"))
      .filter((p): p is string => Boolean(p))
      .slice(0, 16);
    return <Landing posters={posters} />;
  }

  const [grants, myRequests, fresh, recos] = await Promise.all([
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
      .where(eq(schema.media.status, "READY"))
      .orderBy(schema.media.titleId, desc(schema.media.readyAt))
      .limit(30),
    recommend(user),
  ]);
  const latest = fresh.sort((a, b) => (b.readyAt?.getTime() ?? 0) - (a.readyAt?.getTime() ?? 0)).slice(0, 16);

  return (
    <main>
      <SearchHero>
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
              <Poster key={t.id} t={toPoster(t, true)} i={i} size="lg" />
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

        {myRequests.length > 0 && (
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

        {!grants.length && !recos.length && !latest.length && !myRequests.length && (
          <div className="grid min-h-[50vh] place-items-center px-6 text-center">
            <p className="font-display text-5xl font-extrabold leading-none text-bone/15 md:text-8xl">Cherche.<br />Demande.<br />Regarde.</p>
          </div>
        )}
        <div className="h-16" />
      </SearchHero>
    </main>
  );
}
