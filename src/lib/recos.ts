import "server-only";
import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { similar, topRated, type TitleRow } from "./tmdb";
import { recencyBucket } from "./labels";

/**
 * Hybrid recommender, in four steps.
 *
 * 1. Taste profile. Each genre gets a weight from what the member did:
 *    like +3, dislike -3, rating (stars - 3) x 1.5, finished viewing +2, marked seen +1, review +1, request +1, watchlist +1.
 *    Same for eras (less than a year, 1 to 5 years, 5 to 15, classics).
 * 2. Candidates. Titles already online, TMDB "recommendations" of the last liked titles,
 *    and top rated titles of the requested kind. Seen and disliked titles are removed.
 * 3. Score. For each candidate:
 *      1.6 x genre match (average weight of its genres, normalised)
 *    + 0.9 x co-likes (members who liked what you liked also liked this one)
 *    + 0.5 x age cohort (watched a lot by your age bracket lately)
 *    + 0.5 x era match
 *    + 0.3 x TMDB rating, 0.2 x popularity, 0.4 if already online
 *    Without any history, rating, popularity and cohort carry the ranking.
 * 4. Diversity. At most 3 titles sharing the same main genre in a row of results.
 */

type Profile = { genres: Map<string, number>; eras: Map<string, number>; excluded: Set<number>; likedTmdb: { kind: string; tmdbId: number }[] };

async function profile(userId: string): Promise<Profile> {
  const genres = new Map<string, number>();
  const eras = new Map<string, number>();
  const excluded = new Set<number>();
  const add = (gs: string[], w: number) => gs.forEach((g) => genres.set(g, (genres.get(g) ?? 0) + w));
  const era = (year: number | null, w: number) => {
    const b = recencyBucket(year ? new Date().getFullYear() - year : null);
    if (b !== "Inconnu") eras.set(b, (eras.get(b) ?? 0) + w);
  };

  const [likes, seen, watches, reviews, asked, listed, rated] = await Promise.all([
    db
      .select({ id: schema.titles.id, kind: schema.titles.kind, tmdbId: schema.titles.tmdbId, genres: schema.titles.genres, year: schema.titles.year, v: schema.likes.value })
      .from(schema.likes)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.likes.titleId))
      .where(eq(schema.likes.userId, userId))
      .orderBy(desc(schema.likes.createdAt)),
    db
      .select({ id: schema.titles.id, genres: schema.titles.genres, year: schema.titles.year })
      .from(schema.seen)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.seen.titleId))
      .where(eq(schema.seen.userId, userId)),
    db
      .select({ id: schema.titles.id, genres: schema.titles.genres, year: schema.titles.year, done: schema.watchSessions.completed })
      .from(schema.watchSessions)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.watchSessions.titleId))
      .where(eq(schema.watchSessions.userId, userId)),
    db
      .select({ genres: schema.titles.genres, year: schema.titles.year })
      .from(schema.feedback)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.feedback.titleId))
      .where(eq(schema.feedback.userId, userId)),
    db
      .select({ genres: schema.titles.genres, year: schema.titles.year })
      .from(schema.requests)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.requests.titleId))
      .where(eq(schema.requests.userId, userId)),
    db
      .select({ genres: schema.titles.genres, year: schema.titles.year })
      .from(schema.watchlist)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.watchlist.titleId))
      .where(eq(schema.watchlist.userId, userId)),
    db
      .select({ id: schema.titles.id, genres: schema.titles.genres, year: schema.titles.year, score: schema.ratings.score })
      .from(schema.ratings)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.ratings.titleId))
      .where(eq(schema.ratings.userId, userId)),
  ]);

  for (const r of rated) {
    add(r.genres, (r.score - 3) * 1.5);
    if (r.score >= 4) era(r.year, 1);
    excluded.add(r.id);
  }

  for (const l of likes) {
    add(l.genres, l.v * 3);
    if (l.v > 0) era(l.year, 2);
    excluded.add(l.id);
  }
  for (const s of seen) {
    add(s.genres, 1);
    era(s.year, 1);
    excluded.add(s.id);
  }
  for (const w of watches) if (w.done) add(w.genres, 2);
  for (const r of reviews) add(r.genres, 1);
  for (const r of asked) {
    add(r.genres, 1);
    era(r.year, 1);
  }
  for (const r of listed) {
    add(r.genres, 1);
    era(r.year, 1);
  }
  const likedTmdb = likes.filter((l) => l.v > 0).slice(0, 3).map((l) => ({ kind: l.kind, tmdbId: l.tmdbId }));
  return { genres, eras, excluded, likedTmdb };
}

/** Members who liked what this member liked: how many of them also liked each other title. */
async function coLikes(userId: string): Promise<Map<number, number>> {
  const rows = (
    await db.execute<{ title_id: number; n: number }>(sql`
      select l2.title_id, count(distinct l2.user_id)::int as n
      from likes mine
      join likes l1 on l1.title_id = mine.title_id and l1.value = 1 and l1.user_id <> ${userId}
      join likes l2 on l2.user_id = l1.user_id and l2.value = 1
      where mine.user_id = ${userId} and mine.value = 1
      group by l2.title_id
    `)
  ).rows;
  const max = Math.max(1, ...rows.map((r) => r.n));
  return new Map(rows.map((r) => [r.title_id, r.n / max]));
}

async function cohort(ageBracket: string | null): Promise<Map<number, number>> {
  if (!ageBracket) return new Map();
  const rows = await db
    .select({ titleId: schema.watchSessions.titleId, n: sql<number>`count(*)::int` })
    .from(schema.watchSessions)
    .where(and(eq(schema.watchSessions.ageBracket, ageBracket), gt(schema.watchSessions.startedAt, sql`now() - interval '90 days'`)))
    .groupBy(schema.watchSessions.titleId);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return new Map(rows.map((r) => [r.titleId, r.n / max]));
}

export async function readyTitleIds(ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ id: schema.media.titleId })
    .from(schema.media)
    .where(and(inArray(schema.media.titleId, ids), eq(schema.media.status, "READY")));
  return new Set(rows.map((r) => r.id));
}

export async function recommend(
  user: { id: string; ageBracket: string | null },
  limit = 18,
  kind?: "movie" | "tv",
): Promise<TitleRow[]> {
  const p = await profile(user.id);

  const library = (
    await db
      .selectDistinctOn([schema.titles.id], { title: schema.titles })
      .from(schema.media)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.media.titleId))
      .where(and(eq(schema.media.status, "READY"), kind ? eq(schema.titles.kind, kind) : undefined))
  ).map((r) => r.title);
  const fromLikes = (await Promise.all(p.likedTmdb.map((l) => similar(l.kind as "movie" | "tv", l.tmdbId)))).flat();
  const popular = kind ? await topRated(kind).catch(() => []) : [...(await topRated("movie").catch(() => [])).slice(0, 15), ...(await topRated("tv").catch(() => [])).slice(0, 15)];

  const pool = new Map<number, TitleRow>();
  for (const t of [...library, ...fromLikes, ...popular]) {
    if (kind && t.kind !== kind) continue;
    if (!p.excluded.has(t.id)) pool.set(t.id, t);
  }
  if (!pool.size) return [];

  const [co, coh, ready] = await Promise.all([coLikes(user.id), cohort(user.ageBracket), readyTitleIds([...pool.keys()])]);
  const gMax = Math.max(1, ...[...p.genres.values()].map(Math.abs));
  const eTotal = [...p.eras.values()].reduce((a, b) => a + b, 0) || 1;
  const popMax = Math.max(1, ...[...pool.values()].map((t) => t.popularity ?? 0));
  const year = new Date().getFullYear();

  const scored = [...pool.values()]
    .map((t) => {
      const genre = t.genres.length ? t.genres.reduce((a, g) => a + (p.genres.get(g) ?? 0), 0) / t.genres.length / gMax : 0;
      const eraFit = (p.eras.get(recencyBucket(t.year ? year - t.year : null)) ?? 0) / eTotal;
      const score =
        1.6 * genre +
        0.9 * (co.get(t.id) ?? 0) +
        0.5 * (coh.get(t.id) ?? 0) +
        0.5 * eraFit +
        0.3 * ((t.voteAverage ?? 0) / 10) +
        0.2 * ((t.popularity ?? 0) / popMax) +
        (ready.has(t.id) ? 0.4 : 0);
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);

  // Diversity: no more than 3 titles with the same main genre
  const perGenre = new Map<string, number>();
  const out: TitleRow[] = [];
  for (const { t } of scored) {
    const g = t.genres[0] ?? "?";
    if ((perGenre.get(g) ?? 0) >= 3) continue;
    perGenre.set(g, (perGenre.get(g) ?? 0) + 1);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/** Titles this member liked most, used to seed "to request" suggestions from TMDB. */
export async function topLiked(userId: string, n = 2) {
  return db
    .select({ kind: schema.titles.kind, tmdbId: schema.titles.tmdbId })
    .from(schema.likes)
    .innerJoin(schema.titles, eq(schema.titles.id, schema.likes.titleId))
    .where(and(eq(schema.likes.userId, userId), eq(schema.likes.value, 1), ne(schema.likes.value, 0)))
    .orderBy(desc(schema.likes.createdAt))
    .limit(n);
}
