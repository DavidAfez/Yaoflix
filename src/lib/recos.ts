import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { TitleRow } from "./tmdb";
import { recencyBucket } from "./labels";

type Signals = { genres: Map<string, number>; recency: Map<string, number>; seen: Set<number> };

async function signals(userId: string): Promise<Signals> {
  const genres = new Map<string, number>();
  const recency = new Map<string, number>();
  const seen = new Set<number>();
  const bump = (gs: string[], w: number) => gs.forEach((g) => genres.set(g, (genres.get(g) ?? 0) + w));

  const liked = await db
    .select({ id: schema.titles.id, genres: schema.titles.genres, v: schema.likes.value, year: schema.titles.year })
    .from(schema.likes)
    .innerJoin(schema.titles, eq(schema.titles.id, schema.likes.titleId))
    .where(eq(schema.likes.userId, userId));
  for (const l of liked) {
    bump(l.genres, l.v * 3);
    seen.add(l.id);
  }

  const asked = await db
    .select({ id: schema.titles.id, genres: schema.titles.genres, rec: schema.requests.recencyYears })
    .from(schema.requests)
    .innerJoin(schema.titles, eq(schema.titles.id, schema.requests.titleId))
    .where(eq(schema.requests.userId, userId));
  for (const r of asked) {
    bump(r.genres, 1);
    seen.add(r.id);
    const b = recencyBucket(r.rec);
    recency.set(b, (recency.get(b) ?? 0) + 1);
  }

  const watched = await db
    .select({ id: schema.titles.id, genres: schema.titles.genres, done: schema.watchSessions.completed })
    .from(schema.watchSessions)
    .innerJoin(schema.titles, eq(schema.titles.id, schema.watchSessions.titleId))
    .where(eq(schema.watchSessions.userId, userId));
  for (const w of watched) {
    bump(w.genres, w.done ? 2 : 0.5);
    seen.add(w.id);
  }
  return { genres, recency, seen };
}

/**
 * Ranks titles already online for this user:
 * genre affinity (likes, requests, completed views) + what their age bracket watches + their taste for recent or older titles.
 */
export async function recommend(user: { id: string; ageBracket: string | null }, limit = 12): Promise<TitleRow[]> {
  const s = await signals(user.id);
  const library = await db
    .selectDistinctOn([schema.titles.id], { title: schema.titles })
    .from(schema.media)
    .innerJoin(schema.titles, eq(schema.titles.id, schema.media.titleId))
    .where(eq(schema.media.status, "READY"));
  if (!library.length) return [];

  const cohort = new Map<number, number>();
  if (user.ageBracket) {
    const rows = await db
      .select({ titleId: schema.watchSessions.titleId, n: sql<number>`count(*)::int` })
      .from(schema.watchSessions)
      .where(
        and(
          eq(schema.watchSessions.ageBracket, user.ageBracket),
          gt(schema.watchSessions.startedAt, sql`now() - interval '90 days'`),
        ),
      )
      .groupBy(schema.watchSessions.titleId);
    const max = Math.max(1, ...rows.map((r) => r.n));
    rows.forEach((r) => cohort.set(r.titleId, r.n / max));
  }

  const gMax = Math.max(1, ...[...s.genres.values()].map(Math.abs));
  const rTotal = [...s.recency.values()].reduce((a, b) => a + b, 0) || 1;
  const thisYear = new Date().getFullYear();
  const pMax = Math.max(1, ...library.map((l) => l.title.popularity ?? 0));

  return library
    .map(({ title }) => {
      const g = title.genres.reduce((acc, x) => acc + (s.genres.get(x) ?? 0), 0) / gMax / Math.max(1, title.genres.length);
      const r = (s.recency.get(recencyBucket(title.year ? thisYear - title.year : null)) ?? 0) / rTotal;
      const c = cohort.get(title.id) ?? 0;
      const p = (title.popularity ?? 0) / pMax;
      const penalty = s.seen.has(title.id) ? 0.8 : 0;
      return { title, score: g * 1.4 + c * 0.6 + r * 0.5 + p * 0.2 - penalty };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.title);
}

/** Titles this user liked most, used to seed "to request" suggestions from TMDB. */
export async function topLiked(userId: string, n = 2) {
  return db
    .select({ kind: schema.titles.kind, tmdbId: schema.titles.tmdbId })
    .from(schema.likes)
    .innerJoin(schema.titles, eq(schema.titles.id, schema.likes.titleId))
    .where(and(eq(schema.likes.userId, userId), eq(schema.likes.value, 1)))
    .orderBy(desc(schema.likes.createdAt))
    .limit(n);
}

export async function readyTitleIds(ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const rows = await db
    .select({ id: schema.media.titleId })
    .from(schema.media)
    .where(and(inArray(schema.media.titleId, ids), eq(schema.media.status, "READY")));
  return new Set(rows.map((r) => r.id));
}
