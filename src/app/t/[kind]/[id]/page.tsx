import { notFound } from "next/navigation";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { getTitle, img, similar } from "@/lib/tmdb";
import { readyTitleIds } from "@/lib/recos";
import { toPoster } from "@/lib/view";
import { Poster, Row } from "@/components/poster";
import { TitlePanel } from "./panel";

export async function generateMetadata(props: PageProps<"/t/[kind]/[id]">) {
  const { kind, id } = await props.params;
  if (kind !== "movie" && kind !== "tv") return {};
  const t = await getTitle(kind, Number(id));
  return { title: t?.name };
}

export default async function Page(props: PageProps<"/t/[kind]/[id]">) {
  const user = await requireUser();
  const { kind, id } = await props.params;
  if ((kind !== "movie" && kind !== "tv") || !/^\d+$/.test(id)) notFound();
  const title = await getTitle(kind, Number(id));
  if (!title) notFound();

  const [[ready], [request], [listed], [like], [grant], more] = await Promise.all([
    db.select({ id: schema.media.id }).from(schema.media).where(and(eq(schema.media.titleId, title.id), eq(schema.media.status, "READY"))).limit(1),
    db.select().from(schema.requests).where(and(eq(schema.requests.userId, user.id), eq(schema.requests.titleId, title.id))).orderBy(desc(schema.requests.createdAt)).limit(1),
    db.select().from(schema.watchlist).where(and(eq(schema.watchlist.userId, user.id), eq(schema.watchlist.titleId, title.id))),
    db.select().from(schema.likes).where(and(eq(schema.likes.userId, user.id), eq(schema.likes.titleId, title.id))),
    db
      .select({ id: schema.accessGrants.id, expiresAt: schema.accessGrants.expiresAt })
      .from(schema.accessGrants)
      .innerJoin(schema.media, eq(schema.media.id, schema.accessGrants.mediaId))
      .where(
        and(
          eq(schema.accessGrants.userId, user.id),
          eq(schema.media.titleId, title.id),
          eq(schema.media.status, "READY"),
          gt(schema.accessGrants.expiresAt, new Date()),
          isNull(schema.accessGrants.revokedAt),
        ),
      )
      .limit(1),
    similar(kind, title.tmdbId),
  ]);
  const moreReady = await readyTitleIds(more.map((m) => m.id));

  return (
    <main>
      <TitlePanel
        path={`/t/${kind}/${id}`}
        title={{
          id: title.id,
          name: title.name,
          year: title.year,
          runtime: title.runtime,
          genres: title.genres,
          overview: title.overview,
          poster: img(title.posterPath, "w500"),
          backdrop: img(title.backdropPath, "w1280"),
          vote: title.voteAverage,
          kind: title.kind,
        }}
        state={{
          ready: Boolean(ready),
          grant: grant ? { id: grant.id, expiresAt: grant.expiresAt.toISOString() } : null,
          request: request ? { status: request.status, reason: request.rejectReason } : null,
          listed: Boolean(listed),
          like: (like?.value ?? 0) as 1 | -1 | 0,
          verified: Boolean(user.emailVerifiedAt),
        }}
      />
      {more.length > 0 && (
        <Row title="Dans la même veine">
          {more.map((t, i) => (
            <Poster key={t.id} t={toPoster(t, moreReady.has(t.id))} i={i} />
          ))}
        </Row>
      )}
      <div className="h-20" />
    </main>
  );
}
