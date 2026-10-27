import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getLocale } from "./i18n/server";

export type PublicReview = {
  handle: string;
  rating: number | null;
  body: string | null;
  voice: boolean;
  scores: Record<string, number> | null;
  tags: string[] | null;
  at: string;
  title?: { kind: string; tmdbId: number; name: string; posterPath: string | null };
};

/**
 * Everything members said about titles: stars, words (typed or transcribed), detailed analysis.
 * Only the pseudonym is shown. Voice recordings stay private: a voice can identify someone.
 */
async function reviews(filter: ReturnType<typeof sql>, limit: number): Promise<PublicReview[]> {
  const name = (await getLocale()) === "en" ? sql`coalesce(t.name_en, t.name)` : sql`t.name`;
  const rows = await db.execute<{
    handle: string;
    rating: number | null;
    body: string | null;
    voice: boolean;
    scores: Record<string, number> | null;
    tags: string[] | null;
    at: Date;
    kind: string;
    tmdb_id: number;
    name: string;
    poster_path: string | null;
  }>(sql`
    with who as (
      select user_id, title_id, created_at as at from feedback where user_id is not null
      union all select user_id, title_id, updated_at from ratings
      union all select user_id, title_id, updated_at from deep_reviews
    ), pairs as (
      select user_id, title_id, max(at) as at from who group by 1, 2
    )
    select u.handle, r.score as rating, d.scores, d.tags, p.at,
      t.kind, t.tmdb_id, ${name} as name, t.poster_path,
      (select coalesce(nullif(f.text, ''), f.transcript) from feedback f
        where f.user_id = p.user_id and f.title_id = p.title_id and coalesce(nullif(f.text, ''), f.transcript) is not null
        order by f.created_at desc limit 1) as body,
      exists(select 1 from feedback f where f.user_id = p.user_id and f.title_id = p.title_id and f.audio_file is not null) as voice
    from pairs p
    join users u on u.id = p.user_id and u.banned_at is null
    join titles t on t.id = p.title_id
    left join ratings r on r.user_id = p.user_id and r.title_id = p.title_id
    left join deep_reviews d on d.user_id = p.user_id and d.title_id = p.title_id
    where ${filter}
    order by p.at desc
    limit ${limit}
  `);
  return rows.rows.map((r) => ({
    handle: r.handle,
    rating: r.rating,
    body: r.body,
    voice: r.voice,
    scores: r.scores,
    tags: r.tags,
    at: new Date(r.at).toISOString(),
    title: { kind: r.kind, tmdbId: r.tmdb_id, name: r.name, posterPath: r.poster_path },
  }));
}

export const titleReviews = (titleId: number) => reviews(sql`p.title_id = ${titleId}`, 60);
export const userReviews = (userId: string) => reviews(sql`p.user_id = ${userId}`, 60);

/** Average of each criterion and the most picked tags, across every detailed review of a title. */
export async function deepSummary(titleId: number) {
  const scores = await db.execute<{ key: string; avg: number; n: number }>(sql`
    select s.key, avg(s.value::int)::float as avg, count(*)::int as n
    from deep_reviews d, jsonb_each_text(d.scores) s
    where d.title_id = ${titleId}
    group by s.key
  `);
  const tags = await db.execute<{ tag: string; n: number }>(sql`
    select tag, count(*)::int as n from deep_reviews d, unnest(d.tags) tag
    where d.title_id = ${titleId} group by tag order by n desc limit 6
  `);
  const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from deep_reviews where title_id = ${titleId}`)).rows;
  return { count: n, scores: Object.fromEntries(scores.rows.map((r) => [r.key, r.avg])), tags: tags.rows };
}
