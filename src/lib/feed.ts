import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { img } from "./tmdb";
import { getLocale } from "./i18n/server";
import type { PostData, PostMedia } from "@/db/schema";

export type FeedPost = {
  id: string;
  handle: string;
  avatarId: string | null;
  mine: boolean;
  body: string | null;
  voice: boolean;
  at: string;
  title: { kind: string; tmdbId: number; name: string; year: number | null; poster: string | null } | null;
  rating: number | null;
  likes: number;
  reposts: number;
  replies: number;
  liked: boolean;
  reposted: boolean;
  replyTo: string | null;
  kind: string;
  data: PostData | null;
  clip: { id: string; ready: boolean; failed: boolean } | null;
  poll: { counts: number[]; mine: number | null } | null;
  pinned?: boolean;
  media: PostMedia[];
  /** The author's own post waiting for its publication time */
  scheduled: boolean;
  /** Set when the post shows up because someone the member follows reposted it */
  repostedBy?: string;
};

type Row = {
  id: string;
  user_id: string;
  handle: string;
  avatar_id: string | null;
  body: string | null;
  voice: boolean;
  created_at: Date;
  kind: string | null;
  tmdb_id: number | null;
  name: string | null;
  year: number | null;
  poster_path: string | null;
  genres: string[] | null;
  rating: number | null;
  likes: number;
  reposts: number;
  replies: number;
  liked: boolean;
  reposted: boolean;
  reply_to: string | null;
  post_kind: string;
  data: PostData | null;
  clip_id: string | null;
  clip_status: string | null;
  media: PostMedia[] | null;
};

/** Original posts (not reposts) with counters and what the viewer already did on them. */
async function select(me: string, filter: SQL, limit: number, order: SQL = sql`p.created_at desc`): Promise<Row[]> {
  // English speakers get the English title when it is known
  const name = (await getLocale()) === "en" ? sql`coalesce(t.name_en, t.name)` : sql`t.name`;
  const res = await db.execute<Row>(sql`
    select p.id, p.user_id, u.handle, u.avatar_id, p.created_at,
      coalesce(nullif(p.body, ''), f.transcript) as body,
      (f.audio_file is not null) as voice,
      t.kind, t.tmdb_id, ${name} as name, t.year, t.poster_path, t.genres,
      r.score as rating,
      (select count(*)::int from post_likes l where l.post_id = p.id) as likes,
      (select count(*)::int from posts x where x.repost_of = p.id) as reposts,
      (select count(*)::int from posts x where x.parent_id = p.id) as replies,
      exists(select 1 from post_likes l where l.post_id = p.id and l.user_id = ${me}) as liked,
      exists(select 1 from posts x where x.repost_of = p.id and x.user_id = ${me}) as reposted,
      pu.handle as reply_to,
      p.kind as post_kind, p.data, p.clip_id, c.status as clip_status, p.media
    from posts p
    join users u on u.id = p.user_id and u.banned_at is null
    left join feedback f on f.id = p.feedback_id
    left join titles t on t.id = p.title_id
    left join ratings r on r.user_id = p.user_id and r.title_id = p.title_id
    left join posts pp on pp.id = p.parent_id
    left join users pu on pu.id = pp.user_id
    left join clips c on c.id = p.clip_id
    where p.repost_of is null
      and (p.kind <> 'text' or p.media is not null or coalesce(nullif(p.body, ''), f.transcript) is not null or f.audio_file is not null)
      and (p.created_at <= now() or p.user_id = ${me})
      and not exists (select 1 from blocks bl where (bl.blocker_id = ${me} and bl.blocked_id = p.user_id) or (bl.blocker_id = p.user_id and bl.blocked_id = ${me}))
      and ${filter}
    order by ${order}
    limit ${limit}
  `);
  return res.rows;
}

const toPost = (me: string) => (r: Row): FeedPost => ({
  id: r.id,
  handle: r.handle,
  avatarId: r.avatar_id,
  mine: r.user_id === me,
  body: r.body,
  voice: r.voice,
  at: new Date(r.created_at).toISOString(),
  title: r.tmdb_id ? { kind: r.kind!, tmdbId: r.tmdb_id, name: r.name!, year: r.year, poster: img(r.poster_path, "w342") } : null,
  rating: r.rating,
  likes: r.likes,
  reposts: r.reposts,
  replies: r.replies,
  liked: r.liked,
  reposted: r.reposted,
  replyTo: r.reply_to,
  kind: r.post_kind,
  data: r.data,
  clip: r.clip_id ? { id: r.clip_id, ready: r.clip_status === "READY", failed: r.clip_status === "FAILED" } : null,
  poll: null,
  media: r.media ?? [],
  scheduled: new Date(r.created_at).getTime() > Date.now(),
});

/** Vote counts and the member's own vote for the polls among these posts. */
async function withPolls(me: string, posts: FeedPost[]): Promise<FeedPost[]> {
  const ids = posts.filter((p) => p.kind === "poll").map((p) => p.id);
  if (!ids.length) return posts;
  const rows = (
    await db.execute<{ post_id: string; option: number; n: number; mine: boolean }>(sql`
      select post_id, option, count(*)::int as n, bool_or(user_id = ${me}) as mine
      from poll_votes where post_id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
      group by post_id, option
    `)
  ).rows;
  return posts.map((p) => {
    if (p.kind !== "poll" || !p.data || !("options" in p.data)) return p;
    const counts = p.data.options.map((_, i) => rows.find((r) => r.post_id === p.id && r.option === i)?.n ?? 0);
    const mine = rows.find((r) => r.post_id === p.id && r.mine)?.option ?? null;
    return { ...p, poll: { counts, mine } };
  });
}

/**
 * "Pour toi": recent conversations starters ranked by engagement, time and taste.
 * score = (1 + 2 x favs + 3 x reposts + 1.5 x replies + 2 if the title matches the member's genres) / (hours + 2)^1.3
 */
export async function forYou(me: string, limit = 60): Promise<FeedPost[]> {
  const [rows, taste] = await Promise.all([
    select(me, sql`p.parent_id is null and p.created_at > now() - interval '45 days'`, 300),
    db.execute<{ g: string }>(sql`
      select distinct unnest(t.genres) as g from titles t
      where t.id in (select title_id from likes where user_id = ${me} and value = 1 union select title_id from ratings where user_id = ${me} and score >= 4)
    `),
  ]);
  const liked = new Set(taste.rows.map((r) => r.g));
  const now = Date.now();
  const ranked = rows
    .map((r) => {
      const hours = (now - new Date(r.created_at).getTime()) / 3600_000;
      const fit = r.genres?.some((g) => liked.has(g)) ? 2 : 0;
      return { r, score: (1 + 2 * r.likes + 3 * r.reposts + 1.5 * r.replies + fit) / Math.pow(hours + 2, 1.3) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => toPost(me)(x.r));
  return withPolls(me, ranked);
}

/** "Abonnements": posts and reposts of the people the member follows, plus their own, newest first. */
export async function following(me: string, limit = 60): Promise<FeedPost[]> {
  const circle = sql`(select followee_id from follows where follower_id = ${me} union select ${me}::uuid)`;
  const [own, shares] = await Promise.all([
    select(me, sql`p.parent_id is null and p.user_id in ${circle}`, limit),
    db.execute<{ repost_of: string; handle: string; created_at: Date }>(sql`
      select distinct on (p.repost_of) p.repost_of, u.handle, p.created_at
      from posts p join users u on u.id = p.user_id
      where p.repost_of is not null and p.user_id in ${circle}
      order by p.repost_of, p.created_at desc
      limit ${limit}
    `),
  ]);
  const ids = shares.rows.map((s) => s.repost_of);
  const shared = ids.length ? await select(me, sql`p.id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`, limit) : [];
  const byId = new Map(shared.map((r) => [r.id, r]));
  const events = new Map<string, { at: number; post: FeedPost }>();
  for (const r of own) events.set(r.id, { at: new Date(r.created_at).getTime(), post: toPost(me)(r) });
  for (const s of shares.rows) {
    const r = byId.get(s.repost_of);
    const at = new Date(s.created_at).getTime();
    if (!r || (events.get(r.id)?.at ?? 0) >= at) continue;
    events.set(r.id, { at, post: { ...toPost(me)(r), repostedBy: s.handle } });
  }
  return withPolls(me, [...events.values()].sort((a, b) => b.at - a.at).slice(0, limit).map((e) => e.post));
}

/** One post, the post it answers, and its replies. */
export async function thread(me: string, id: string) {
  const [post] = await select(me, sql`p.id = ${id}::uuid`, 1);
  if (!post) return null;
  const [parentRow] = await db.execute<{ parent_id: string | null }>(sql`select parent_id from posts where id = ${id}::uuid`).then((r) => r.rows);
  const parent = parentRow?.parent_id ? (await select(me, sql`p.id = ${parentRow.parent_id}::uuid`, 1))[0] : undefined;
  const replies = await select(me, sql`p.parent_id = ${id}::uuid`, 200, sql`p.created_at asc`);
  const [one, ...rest] = await withPolls(me, [toPost(me)(post), ...(parent ? [toPost(me)(parent)] : []), ...replies.map(toPost(me))]);
  return { post: one, parent: parent ? rest[0] : null, replies: parent ? rest.slice(1) : rest };
}

export async function postsBy(me: string, userId: string, limit = 40) {
  return withPolls(me, (await select(me, sql`p.user_id = ${userId}`, limit)).map(toPost(me)));
}

/** The top 5 the member pinned on the profile, if any. */
export async function pinnedPost(me: string, userId: string) {
  const [r] = (await db.execute<{ id: string | null }>(sql`select pinned_post_id as id from users where id = ${userId}`)).rows;
  if (!r?.id) return null;
  const [row] = await select(me, sql`p.id = ${r.id}::uuid`, 1);
  return row ? { ...toPost(me)(row), pinned: true } : null;
}

export async function followState(me: string, userId: string) {
  const [r] = (
    await db.execute<{ following: boolean; followers: number; follows: number }>(sql`
      select exists(select 1 from follows where follower_id = ${me} and followee_id = ${userId}) as following,
        (select count(*)::int from follows where followee_id = ${userId}) as followers,
        (select count(*)::int from follows where follower_id = ${userId}) as follows
    `)
  ).rows;
  return r;
}

/** A profile's four lists: posts, replies, reposts, posts with pictures or clips. */
export async function profileFeed(me: string, userId: string) {
  const own = await withPolls(me, (await select(me, sql`p.user_id = ${userId}`, 120)).map(toPost(me)));
  const shared = (
    await db.execute<{ repost_of: string }>(sql`select repost_of from posts where user_id = ${userId} and repost_of is not null order by created_at desc limit 60`)
  ).rows.map((r) => r.repost_of);
  const reposts = shared.length ? await withPolls(me, (await select(me, sql`p.id in (${sql.join(shared.map((id) => sql`${id}::uuid`), sql`, `)})`, 60)).map(toPost(me))) : [];
  return {
    posts: own.filter((p) => !p.replyTo),
    replies: own.filter((p) => p.replyTo),
    reposts,
    media: own.filter((p) => p.media.length || p.clip),
  };
}
