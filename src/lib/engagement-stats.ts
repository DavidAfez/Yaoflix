import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { FEATURES, group, holdoutShare, twoProportionP } from "./engagement";
import { TROPHIES } from "./trophy-defs";

const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;

/**
 * How the site is used and whether the engagement features help: daily actives, weekly
 * cohorts, what each nudge got, the test group against the holdout, and trophy rarity.
 */
export async function getEngagement(days: number) {
  const [activity] = await q<{ dau: number; wau: number; mau: number; minutes: number | null }>(sql`
    select
      (select count(distinct user_id)::int from platform_sessions where last_seen_at > now() - interval '1 day') as dau,
      (select count(distinct user_id)::int from platform_sessions where last_seen_at > now() - interval '7 days') as wau,
      (select count(distinct user_id)::int from platform_sessions where last_seen_at > now() - interval '30 days') as mau,
      (select sum(active_sec)::float / nullif(count(distinct (user_id, started_at::date)), 0) / 60
         from platform_sessions where started_at > now() - make_interval(days => ${days}) and user_id is not null) as minutes`);

  const daily = await q<{ day: string; users: number }>(sql`
    with d as (select generate_series(current_date - (${days}::int - 1), current_date, interval '1 day')::date as day)
    select to_char(d.day, 'YYYY-MM-DD') as day,
      (select count(distinct user_id)::int from platform_sessions p where p.started_at::date = d.day and p.user_id is not null) as users
    from d order by d.day`);

  // Weekly cohorts: of the members who joined a given week, the share active k weeks later
  const cohortRows = await q<{ cohort: string; size: number; k: number; n: number }>(sql`
    with c as (
      select id, date_trunc('week', created_at) as wk from users
      where approved_at is not null and created_at > date_trunc('week', now()) - interval '7 weeks'
    ),
    a as (select distinct user_id, date_trunc('week', started_at) as wk from platform_sessions where user_id is not null)
    select to_char(c.wk, 'YYYY-MM-DD') as cohort,
      (select count(*)::int from c c2 where c2.wk = c.wk) as size,
      (extract(epoch from a.wk - c.wk) / 604800)::int as k,
      count(distinct c.id)::int as n
    from c join a on a.user_id = c.id and a.wk >= c.wk
    group by c.wk, k order by c.wk, k`);
  const cohorts = [...new Map(cohortRows.map((r) => [r.cohort, { cohort: r.cohort, size: r.size, weeks: [] as (number | null)[] }])).values()];
  for (const c of cohorts) {
    const age = Math.floor((Date.now() - new Date(c.cohort).getTime()) / (7 * 86400_000));
    c.weeks = Array.from({ length: 8 }, (_, k) => (k > age ? null : (cohortRows.find((r) => r.cohort === c.cohort && r.k === k)?.n ?? 0) / Math.max(1, c.size)));
  }

  const events = await q<{ feature: string; action: string; n: number; users: number }>(sql`
    select feature, action, count(*)::int as n, count(distinct user_id)::int as users
    from engagement_events where at > now() - make_interval(days => ${days}) group by 1, 2`);
  const features = FEATURES.map((f) => {
    const get = (a: string) => events.find((e) => e.feature === f && e.action === a);
    const shown = get("shown")?.n ?? 0;
    const clicks = get("click")?.n ?? 0;
    return { feature: f, shown, reached: get("shown")?.users ?? 0, clicks, unlocks: get("unlock")?.n ?? 0, ctr: shown ? clicks / shown : null };
  });

  // Test group against holdout: same site, minus the nudges
  const members = await q<{ id: string; active7: boolean; sessions: number; minutes: number }>(sql`
    select u.id,
      exists (select 1 from platform_sessions p where p.user_id = u.id and p.last_seen_at > now() - interval '7 days') as active7,
      (select count(*)::int from platform_sessions p where p.user_id = u.id and p.started_at > now() - interval '28 days') as sessions,
      coalesce((select sum(active_sec)::float / 60 from platform_sessions p where p.user_id = u.id and p.started_at > now() - interval '28 days'), 0) as minutes
    from users u where u.approved_at is not null and u.banned_at is null`);
  const by = (g: "test" | "holdout") => {
    const m = members.filter((x) => group(x.id) === g);
    const n = m.length;
    return {
      n,
      active: m.filter((x) => x.active7).length,
      rate: n ? m.filter((x) => x.active7).length / n : null,
      sessions: n ? m.reduce((a, x) => a + x.sessions, 0) / n : null,
      minutes: n ? m.reduce((a, x) => a + x.minutes, 0) / n : null,
    };
  };
  const test = by("test");
  const holdout = by("holdout");
  const experiment = { share: holdoutShare(), test, holdout, p: twoProportionP(test.active, test.n, holdout.active, holdout.n) };

  const holders = await q<{ trophy: string; n: number }>(sql`select trophy, count(*)::int as n from user_trophies group by 1`);
  const total = members.length;
  const trophies = TROPHIES.map((t) => {
    const n = holders.find((h) => h.trophy === t.id)?.n ?? 0;
    return { id: t.id, tier: t.tier, name: t.name, n, share: total ? n / total : 0 };
  });

  return { activity: { ...activity, stickiness: activity.mau ? activity.dau / activity.mau : null }, daily, cohorts, features, experiment, trophies, members: total };
}

export type Engagement = Awaited<ReturnType<typeof getEngagement>>;
