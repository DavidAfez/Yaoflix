import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

type Row = Record<string, unknown>;
const q = async <T extends Row>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[];

/**
 * Interest = a request or a viewing, each carrying the demographic snapshot taken at that moment.
 * Recency = how old the title was when it was asked for or watched.
 */
const interest = (days: number) => sql`
  (
    select r.title_id, r.age_bracket, r.sex, r.country, r.recency_years, 'request' as kind, r.created_at as at
    from requests r where r.created_at > now() - make_interval(days => ${days})
    union all
    select w.title_id, w.age_bracket, w.sex, w.country,
      case when t.year is null then null else extract(year from w.started_at)::int - t.year end,
      'watch', w.started_at
    from watch_sessions w join titles t on t.id = w.title_id
    where w.started_at > now() - make_interval(days => ${days})
  )`;

export async function getInsights(days: number) {
  const [kpi] = await q<{
    users: number;
    new_users: number;
    open: number;
    served: number;
    rejected: number;
    focus_median: number | null;
    session_avg: number | null;
    voice: number;
    completion: number | null;
    errors: number;
  }>(sql`
    select
      (select count(*)::int from users) as users,
      (select count(*)::int from users where created_at > now() - make_interval(days => ${days})) as new_users,
      (select count(*)::int from requests where status in ('PENDING','IN_PROGRESS')) as open,
      (select count(*)::int from requests where status = 'FULFILLED' and created_at > now() - make_interval(days => ${days})) as served,
      (select count(*)::int from requests where status = 'REJECTED' and created_at > now() - make_interval(days => ${days})) as rejected,
      (select percentile_cont(0.5) within group (order by seconds) from focus_spans where created_at > now() - make_interval(days => ${days})) as focus_median,
      (select avg(active_sec) from platform_sessions where started_at > now() - make_interval(days => ${days}) and active_sec > 0) as session_avg,
      (select count(*)::int from feedback where created_at > now() - make_interval(days => ${days})) as voice,
      (select avg(case when completed then 1 else 0 end) from watch_sessions where started_at > now() - make_interval(days => ${days})) as completion,
      (select count(*)::int from error_logs where resolved_at is null) as errors
  `);

  const daily = await q<{ day: string; requests: number; served: number; watches: number }>(sql`
    with d as (select generate_series(current_date - (${days}::int - 1), current_date, interval '1 day')::date as day)
    select to_char(d.day, 'YYYY-MM-DD') as day,
      (select count(*)::int from requests r where r.created_at::date = d.day) as requests,
      (select count(*)::int from requests r where r.handled_at::date = d.day and r.status = 'FULFILLED') as served,
      (select count(*)::int from watch_sessions w where w.started_at::date = d.day) as watches
    from d order by d.day
  `);

  const genreAge = await q<{ genre: string; age: string; n: number }>(sql`
    select g as genre, coalesce(i.age_bracket, '?') as age, count(*)::int as n
    from ${interest(days)} i join titles t on t.id = i.title_id, unnest(t.genres) g
    group by 1, 2
  `);

  const genreSex = await q<{ genre: string; sex: string; n: number }>(sql`
    select g as genre, coalesce(i.sex, '?') as sex, count(*)::int as n
    from ${interest(days)} i join titles t on t.id = i.title_id, unnest(t.genres) g
    group by 1, 2
  `);

  const recencyAge = await q<{ age: string; bucket: string; n: number }>(sql`
    select coalesce(age_bracket, '?') as age,
      case when recency_years is null then 'Inconnu'
           when recency_years < 1 then 'Moins d''un an'
           when recency_years < 5 then '1 à 5 ans'
           when recency_years < 15 then '5 à 15 ans'
           else 'Classiques' end as bucket,
      count(*)::int as n
    from ${interest(days)} i group by 1, 2
  `);

  const countries = await q<{ country: string; sessions: number; minutes: number }>(sql`
    select coalesce(country, '??') as country, count(*)::int as sessions, round(sum(active_sec) / 60.0)::int as minutes
    from platform_sessions where started_at > now() - make_interval(days => ${days})
    group by 1 order by 2 desc limit 12
  `);

  const focus = await q<{ bucket: string; n: number }>(sql`
    select case when seconds < 300 then '<5' when seconds < 900 then '5-15' when seconds < 1800 then '15-30'
                when seconds < 3600 then '30-60' else '60+' end as bucket, count(*)::int as n
    from focus_spans where created_at > now() - make_interval(days => ${days}) group by 1
  `);

  const sessions = await q<{ bucket: string; n: number }>(sql`
    select case when active_sec < 120 then '<2' when active_sec < 600 then '2-10' when active_sec < 1800 then '10-30'
                when active_sec < 3600 then '30-60' when active_sec < 7200 then '60-120' else '120+' end as bucket, count(*)::int as n
    from platform_sessions where started_at > now() - make_interval(days => ${days}) group by 1
  `);

  const focusByAge = await q<{ age: string; median: number; pauses: number }>(sql`
    select coalesce(w.age_bracket, '?') as age,
      round((percentile_cont(0.5) within group (order by f.seconds) / 60.0)::numeric, 1)::float as median,
      round(avg(w.pauses)::numeric, 1)::float as pauses
    from focus_spans f join watch_sessions w on w.id = f.watch_session_id
    where f.created_at > now() - make_interval(days => ${days})
    group by 1 order by 1
  `);

  const devices = await q<{ device: string; n: number }>(sql`
    select coalesce(device, '?') as device, count(*)::int as n
    from platform_sessions where started_at > now() - make_interval(days => ${days}) group by 1 order by 2 desc
  `);

  const reasons = await q<{ reason: string; n: number }>(sql`
    select reject_reason::text as reason, count(*)::int as n from requests
    where status = 'REJECTED' and created_at > now() - make_interval(days => ${days}) group by 1 order by 2 desc
  `);

  const topTitles = await q<{ name: string; requests: number; watches: number }>(sql`
    select t.name,
      count(*) filter (where i.kind = 'request')::int as requests,
      count(*) filter (where i.kind = 'watch')::int as watches
    from ${interest(days)} i join titles t on t.id = i.title_id
    group by t.id, t.name order by count(*) desc limit 10
  `);

  const voices = await q<{ id: string; file: string; title: string | null; handle: string | null; duration: number | null; source: string; at: string; age: string | null; transcript: string | null }>(sql`
    select f.id, f.audio_file as file, t.name as title, u.handle, f.duration_sec as duration, f.source, f.transcript,
      to_char(f.created_at, 'DD/MM HH24:MI') as at, u.age_bracket as age
    from feedback f left join titles t on t.id = f.title_id left join users u on u.id = f.user_id
    order by f.created_at desc limit 30
  `);

  return { kpi, daily, genreAge, genreSex, recencyAge, countries, focus, sessions, focusByAge, devices, reasons, topTitles, voices };
}

export type Insights = Awaited<ReturnType<typeof getInsights>>;
