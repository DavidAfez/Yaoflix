import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { notify } from "./notify-center";
import { TROPHIES, trophyById, won, type TrophyStats } from "./trophy-defs";
import { group, track } from "./engagement";

/** Everything the trophies look at, for one member, in one round trip. */
export async function trophyStats(userId: string): Promise<TrophyStats> {
  const { rows } = await db.execute<{
    movie: number; tv: number; album: number; book: number;
    genres: string[] | null; decades: number; ratings: number; voice: number; posts: number;
    likes: number; requests: number; watchlist: number; watchlist_seen: number; night: number; catalogue: number;
  }>(sql`
    with s as (select t.kind, t.genres, t.year from seen x join titles t on t.id = x.title_id where x.user_id = ${userId})
    select
      (select count(*)::int from s where kind = 'movie') as movie,
      (select count(*)::int from s where kind = 'tv') as tv,
      (select count(*)::int from s where kind = 'album') as album,
      (select count(*)::int from s where kind = 'book') as book,
      (select array_agg(distinct g) from s, unnest(s.genres) g where s.kind in ('movie', 'tv')) as genres,
      (select count(distinct (year / 10))::int from s where kind = 'movie' and year is not null) as decades,
      (select count(*)::int from ratings where user_id = ${userId}) as ratings,
      (select count(*)::int from feedback where user_id = ${userId} and audio_file is not null) as voice,
      (select count(*)::int from posts where user_id = ${userId} and repost_of is null) as posts,
      (select count(*)::int from post_likes l join posts p on p.id = l.post_id where p.user_id = ${userId} and l.user_id <> ${userId}) as likes,
      (select count(*)::int from requests where user_id = ${userId}) as requests,
      (select count(*)::int from watchlist where user_id = ${userId}) as watchlist,
      (select count(*)::int from watchlist w join seen x on x.title_id = w.title_id and x.user_id = w.user_id where w.user_id = ${userId}) as watchlist_seen,
      (select count(*)::int from watch_sessions where user_id = ${userId} and extract(hour from started_at at time zone 'Europe/Paris') < 5) as night,
      (select count(*)::int from titles) as catalogue
  `);
  const r = rows[0];
  return {
    seen: { movie: r.movie, tv: r.tv, album: r.album, book: r.book },
    genres: r.genres ?? [],
    decades: r.decades,
    ratings: r.ratings,
    voice: r.voice,
    posts: r.posts,
    likesReceived: r.likes,
    requests: r.requests,
    watchlist: r.watchlist,
    watchlistSeen: r.watchlist_seen,
    nightWatches: r.night,
    catalogue: r.catalogue,
    seenAll: r.movie + r.tv + r.album + r.book,
  };
}

const lastSync = new Map<string, number>();

/**
 * Awards what the member just earned. Called on every page (layout), at most every 15 s per
 * member, so no action has to remember to call it. Won trophies stay won.
 */
export async function syncTrophies(userId: string, force = false) {
  const now = Date.now();
  if (!force && now - (lastSync.get(userId) ?? 0) < 15_000) return;
  lastSync.set(userId, now);
  if (lastSync.size > 5000) lastSync.clear();

  const [stats, have] = await Promise.all([
    trophyStats(userId),
    db.select({ trophy: schema.userTrophies.trophy }).from(schema.userTrophies).where(eq(schema.userTrophies.userId, userId)),
  ]);
  const owned = new Set(have.map((h) => h.trophy));
  const fresh = TROPHIES.filter((t) => !owned.has(t.id) && won(t, stats)).map((t) => t.id);
  if (!fresh.length) return;
  const added = await db
    .insert(schema.userTrophies)
    .values(fresh.map((trophy) => ({ userId, trophy })))
    .onConflictDoNothing()
    .returning({ trophy: schema.userTrophies.trophy });
  const grp = group(userId);
  // One line in the bell per batch, not one per trophy
  if (added.length) await notify(userId, "trophy", { title: trophyById.get(added[0].trophy)?.name, reason: String(added.length), href: "/me?tab=trophees" });
  for (const { trophy } of added) await track(userId, "trophy", "unlock", trophy, grp);
}

/** Won trophies not celebrated yet, oldest first. */
export async function unseenTrophies(userId: string) {
  const rows = await db
    .select({ trophy: schema.userTrophies.trophy })
    .from(schema.userTrophies)
    .where(and(eq(schema.userTrophies.userId, userId), isNull(schema.userTrophies.seenAt)))
    .orderBy(schema.userTrophies.unlockedAt);
  return rows.map((r) => r.trophy).filter((id) => trophyById.has(id));
}

export async function markTrophiesSeen(userId: string) {
  await db.update(schema.userTrophies).set({ seenAt: new Date() }).where(and(eq(schema.userTrophies.userId, userId), isNull(schema.userTrophies.seenAt)));
}

export type TrophyView = { id: string; won: string | null; have: number; need: number; rare: number };

/** Every trophy with the member's progress, and how many members hold it (rarity, in %). */
export async function trophyBoard(userId: string): Promise<TrophyView[]> {
  const [stats, mine, counts, [{ members }]] = await Promise.all([
    trophyStats(userId),
    db.select().from(schema.userTrophies).where(eq(schema.userTrophies.userId, userId)),
    db.select({ trophy: schema.userTrophies.trophy, n: sql<number>`count(*)::int` }).from(schema.userTrophies).groupBy(schema.userTrophies.trophy),
    db.select({ members: sql<number>`count(*)::int` }).from(schema.users).where(sql`approved_at is not null`),
  ]);
  const at = new Map(mine.map((m) => [m.trophy, m.unlockedAt.toISOString()]));
  const n = new Map(counts.map((c) => [c.trophy, c.n]));
  return TROPHIES.map((t) => {
    const [have, need] = t.progress(stats);
    return { id: t.id, won: at.get(t.id) ?? null, have: Math.min(have, need), need, rare: members ? Math.round(((n.get(t.id) ?? 0) / members) * 100) : 0 };
  });
}

/** A member's won trophies, newest first, for their public profile. */
export async function wonTrophies(userId: string) {
  const rows = await db
    .select({ trophy: schema.userTrophies.trophy, at: schema.userTrophies.unlockedAt })
    .from(schema.userTrophies)
    .where(eq(schema.userTrophies.userId, userId))
    .orderBy(sql`${schema.userTrophies.unlockedAt} desc`);
  return rows.filter((r) => trophyById.has(r.trophy)).map((r) => r.trophy);
}
