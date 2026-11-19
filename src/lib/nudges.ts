import "server-only";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { group } from "./engagement";
import { trophyStats } from "./trophies";
import { nearest } from "./trophy-defs";
import { img } from "./tmdb";

export type Nudges = {
  welcome: { days: number; ready: number; posts: number; followers: number; trophies: number } | null;
  pick: { kind: string; tmdbId: number; name: string; year: number | null; poster: string | null; backdrop: string | null; why: "ready" | "liked" } | null;
  near: { id: string; have: number; need: number } | null;
};

const EMPTY: Nudges = { welcome: null, pick: null, near: null };

/**
 * The quiet nudges of the home page. A member in the holdout group gets none of them, so their
 * return rate can be compared with everyone else's (see Studio, Engagement).
 */
export async function getNudges(userId: string): Promise<Nudges> {
  if (group(userId) === "holdout") return EMPTY;
  const [welcome, pick, near] = await Promise.all([welcomeBack(userId), dailyPick(userId), nearTrophy(userId)]);
  return { welcome, pick, near };
}

/** Back after five days or more: what happened meanwhile, in numbers that point somewhere. */
async function welcomeBack(userId: string): Promise<Nudges["welcome"]> {
  const { rows } = await db.execute<{ prev: Date | null }>(sql`
    select max(last_seen_at) as prev from platform_sessions
    where user_id = ${userId} and last_seen_at < now() - interval '30 minutes'`);
  const prev = rows[0]?.prev ? new Date(rows[0].prev) : null;
  if (!prev) return null;
  const days = Math.floor((Date.now() - prev.getTime()) / 86400_000);
  if (days < 5) return null;
  const { rows: r } = await db.execute<{ ready: number; posts: number; followers: number; trophies: number }>(sql`
    select
      (select count(distinct m.title_id)::int from media m join watchlist w on w.title_id = m.title_id and w.user_id = ${userId}
        where m.status = 'READY' and m.ready_at > ${prev}) as ready,
      (select count(*)::int from posts p where p.created_at > ${prev} and p.created_at <= now() and p.parent_id is null and p.user_id <> ${userId}) as posts,
      (select count(*)::int from follows f where f.followee_id = ${userId} and f.created_at > ${prev}) as followers,
      (select count(*)::int from user_trophies u join follows f on f.followee_id = u.user_id and f.follower_id = ${userId} where u.unlocked_at > ${prev}) as trophies`);
  const w = r[0];
  return w.ready + w.posts + w.followers + w.trophies > 0 ? { days, ...w } : null;
}

/**
 * One title a day, the same all day, another tomorrow: something ready to watch first, else a
 * title that looks like what the member liked. Never something seen or refused.
 */
async function dailyPick(userId: string): Promise<Nudges["pick"]> {
  const pool = await db.execute<Record<string, unknown>>(sql`
    (select t.*, 'ready' as why from titles t
      where t.kind in ('movie', 'tv') and exists (select 1 from media m where m.title_id = t.id and m.status = 'READY')
        and not exists (select 1 from seen s where s.title_id = t.id and s.user_id = ${userId})
        and not exists (select 1 from nevers n where n.title_id = t.id and n.user_id = ${userId})
      limit 40)
    union all
    (select t.*, 'liked' as why from titles t
      where t.kind in ('movie', 'tv') and t.poster_path is not null
        and t.genres && coalesce((select array_agg(distinct g) from likes l join titles lt on lt.id = l.title_id, unnest(lt.genres) g
                                   where l.user_id = ${userId} and l.value = 1), '{}')
        and not exists (select 1 from seen s where s.title_id = t.id and s.user_id = ${userId})
        and not exists (select 1 from nevers n where n.title_id = t.id and n.user_id = ${userId})
      order by t.vote_average desc nulls last limit 40)`);
  const rows = pool.rows;
  if (!rows.length) return null;
  const ready = rows.filter((r) => r.why === "ready");
  const list = ready.length ? ready : rows;
  const day = new Date().toISOString().slice(0, 10);
  const i = createHash("sha256").update(`${userId}:${day}`).digest().readUInt32BE(0) % list.length;
  // Raw rows: column names as stored
  const raw = list[i];
  return {
    kind: String(raw.kind),
    tmdbId: Number(raw.tmdb_id),
    name: String(raw.name),
    year: (raw.year as number | null) ?? null,
    poster: img((raw.poster_path as string | null) ?? null, "w342"),
    backdrop: img((raw.backdrop_path as string | null) ?? null, "w780"),
    why: raw.why === "ready" ? "ready" : "liked",
  };
}

/** The trophy the member is closest to, once two thirds of the way are done. */
async function nearTrophy(userId: string): Promise<Nudges["near"]> {
  const [stats, owned] = await Promise.all([
    trophyStats(userId),
    db.select({ trophy: schema.userTrophies.trophy }).from(schema.userTrophies).where(eq(schema.userTrophies.userId, userId)),
  ]);
  const n = nearest(stats, new Set(owned.map((o) => o.trophy)));
  return n ? { id: n.def.id, have: n.have, need: n.need } : null;
}
