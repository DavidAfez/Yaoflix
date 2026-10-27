import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { DEEP_UNLOCK } from "./deep";
import { db, schema } from "@/db";

export type MarkKey = `${string}:${number}`;
export const markKey = (kind: string, tmdbId: number): MarkKey => `${kind}:${tmdbId}`;

export type Marks = { liked: MarkKey[]; disliked: MarkKey[]; seen: MarkKey[]; reviewed: MarkKey[]; never: MarkKey[]; ratings: Record<MarkKey, number> };

/** Everything the member has liked, seen or reviewed, keyed by kind:tmdbId so any poster can show it. */
export async function getMarks(userId: string): Promise<Marks> {
  const [likeRows, seenRows, reviewRows, rateRows, neverRows] = await Promise.all([
    db
      .select({ kind: schema.titles.kind, tmdbId: schema.titles.tmdbId, value: schema.likes.value })
      .from(schema.likes)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.likes.titleId))
      .where(eq(schema.likes.userId, userId)),
    db
      .select({ kind: schema.titles.kind, tmdbId: schema.titles.tmdbId })
      .from(schema.seen)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.seen.titleId))
      .where(eq(schema.seen.userId, userId)),
    db
      .selectDistinct({ kind: schema.titles.kind, tmdbId: schema.titles.tmdbId })
      .from(schema.feedback)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.feedback.titleId))
      .where(eq(schema.feedback.userId, userId)),
    db
      .select({ kind: schema.titles.kind, tmdbId: schema.titles.tmdbId, score: schema.ratings.score })
      .from(schema.ratings)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.ratings.titleId))
      .where(eq(schema.ratings.userId, userId)),
    db
      .select({ kind: schema.titles.kind, tmdbId: schema.titles.tmdbId })
      .from(schema.nevers)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.nevers.titleId))
      .where(eq(schema.nevers.userId, userId)),
  ]);
  return {
    liked: likeRows.filter((r) => r.value > 0).map((r) => markKey(r.kind, r.tmdbId)),
    disliked: likeRows.filter((r) => r.value < 0).map((r) => markKey(r.kind, r.tmdbId)),
    seen: seenRows.map((r) => markKey(r.kind, r.tmdbId)),
    reviewed: reviewRows.map((r) => markKey(r.kind, r.tmdbId)),
    never: neverRows.map((r) => markKey(r.kind, r.tmdbId)),
    ratings: Object.fromEntries(rateRows.map((r) => [markKey(r.kind, r.tmdbId), r.score])),
  };
}

export async function titleIdFor(kind: string, tmdbId: number): Promise<number | null> {
  const [t] = await db
    .select({ id: schema.titles.id })
    .from(schema.titles)
    .where(and(eq(schema.titles.kind, kind), eq(schema.titles.tmdbId, tmdbId)));
  return t?.id ?? null;
}

export async function markSeen(userId: string, titleId: number, source: "manual" | "like" | "review" | "watch" | "rating") {
  await db.insert(schema.seen).values({ userId, titleId, source }).onConflictDoNothing();
}

export async function seenTitleIds(userId: string, ids?: number[]): Promise<Set<number>> {
  const rows = await db
    .select({ id: schema.seen.titleId })
    .from(schema.seen)
    .where(ids?.length ? and(eq(schema.seen.userId, userId), inArray(schema.seen.titleId, ids)) : eq(schema.seen.userId, userId));
  return new Set(rows.map((r) => r.id));
}


/** Titles the member refuses to watch, to drop them from the home rows. */
export async function neverTitleIds(userId: string): Promise<Set<number>> {
  const rows = await db.select({ id: schema.nevers.titleId }).from(schema.nevers).where(eq(schema.nevers.userId, userId));
  return new Set(rows.map((r) => r.id));
}

/** Detailed reviews: granted by staff, or earned with enough reviews. */
export async function deepState(userId: string): Promise<{ allowed: boolean; count: number }> {
  const [r] = await db
    .select({
      flag: schema.users.deepReview,
      n: sql<number>`(select count(*)::int from feedback f where f.user_id = "users"."id")`,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return { allowed: Boolean(r && (r.flag || r.n >= DEEP_UNLOCK)), count: r?.n ?? 0 };
}

export const deepAllowed = async (userId: string) => (await deepState(userId)).allowed;

/**
 * Hours spent on titles: streamed time here, plus, for titles marked seen and never streamed,
 * the runtime of a film or every aired episode of a series (seen means seen in full).
 */
export async function hoursSeen(userId: string): Promise<number> {
  // Titles found through lists lack runtime and episode count: fetch details once, they stay in the cache
  const missing = await db.execute<{ kind: "movie" | "tv"; tmdb_id: number }>(sql`
    select t.kind, t.tmdb_id from seen s join titles t on t.id = s.title_id
    where s.user_id = ${userId} and (t.runtime is null or (t.kind = 'tv' and t.episodes is null))
    limit 150
  `);
  if (missing.rows.length) {
    const { getTitle } = await import("./tmdb");
    for (let i = 0; i < missing.rows.length; i += 20) {
      await Promise.all(missing.rows.slice(i, i + 20).map((r) => getTitle(r.kind, r.tmdb_id).catch(() => null)));
    }
  }
  const [r] = (
    await db.execute<{ h: number }>(sql`
      select (
        coalesce((select sum(watched_sec) from watch_sessions where user_id = ${userId}), 0) / 3600.0 +
        coalesce((
          select sum(case when t.kind = 'tv' then coalesce(t.runtime, 0) * coalesce(t.episodes, 0) else coalesce(t.runtime, 0) end)
          from seen s join titles t on t.id = s.title_id
          where s.user_id = ${userId}
            and not exists (select 1 from watch_sessions w where w.user_id = s.user_id and w.title_id = s.title_id)
        ), 0) / 60.0
      )::float as h
    `)
  ).rows;
  return r?.h ?? 0;
}
