import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export type MarkKey = `${string}:${number}`;
export const markKey = (kind: string, tmdbId: number): MarkKey => `${kind}:${tmdbId}`;

export type Marks = { liked: MarkKey[]; disliked: MarkKey[]; seen: MarkKey[]; reviewed: MarkKey[]; ratings: Record<MarkKey, number> };

/** Everything the member has liked, seen or reviewed, keyed by kind:tmdbId so any poster can show it. */
export async function getMarks(userId: string): Promise<Marks> {
  const [likeRows, seenRows, reviewRows, rateRows] = await Promise.all([
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
  ]);
  return {
    liked: likeRows.filter((r) => r.value > 0).map((r) => markKey(r.kind, r.tmdbId)),
    disliked: likeRows.filter((r) => r.value < 0).map((r) => markKey(r.kind, r.tmdbId)),
    seen: seenRows.map((r) => markKey(r.kind, r.tmdbId)),
    reviewed: reviewRows.map((r) => markKey(r.kind, r.tmdbId)),
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

