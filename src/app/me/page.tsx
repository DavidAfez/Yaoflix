import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { recommend, topLiked, readyTitleIds } from "@/lib/recos";
import { similar, img } from "@/lib/tmdb";
import { toPoster } from "@/lib/view";
import { roleLabel } from "@/lib/rbac";
import { recencyBucket, recencyOrder } from "@/lib/labels";
import { MeTabs } from "./tabs";
import { logout } from "../(auth)/actions";
import { Bug, LogOut } from "lucide-react";
import Link from "next/link";
import { Stat } from "./stat";

export const metadata = { title: "Moi" };

export default async function Page() {
  const user = await requireUser();
  const uid = user.id;

  const [recos, liked, reqs, seeds, listed, watching, [stats], tasteRows, seenRows, recencyRows] = await Promise.all([
    recommend(user, 18),
    db
      .select({ title: schema.titles })
      .from(schema.likes)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.likes.titleId))
      .where(and(eq(schema.likes.userId, uid), eq(schema.likes.value, 1)))
      .orderBy(desc(schema.likes.createdAt)),
    db
      .select({ req: schema.requests, title: schema.titles })
      .from(schema.requests)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.requests.titleId))
      .where(eq(schema.requests.userId, uid))
      .orderBy(desc(schema.requests.createdAt))
      .limit(80),
    topLiked(uid),
    db
      .select({ title: schema.titles })
      .from(schema.watchlist)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.watchlist.titleId))
      .where(eq(schema.watchlist.userId, uid))
      .orderBy(desc(schema.watchlist.createdAt))
      .limit(18),
    // Started but not finished, link still valid
    db
      .select({ grantId: schema.accessGrants.id, pos: schema.accessGrants.lastPositionSec, dur: schema.media.durationSec, exp: schema.accessGrants.expiresAt, title: schema.titles })
      .from(schema.accessGrants)
      .innerJoin(schema.media, eq(schema.media.id, schema.accessGrants.mediaId))
      .innerJoin(schema.titles, eq(schema.titles.id, schema.media.titleId))
      .where(
        and(
          eq(schema.accessGrants.userId, uid),
          gt(schema.accessGrants.expiresAt, new Date()),
          isNull(schema.accessGrants.revokedAt),
          eq(schema.media.status, "READY"),
          gt(schema.accessGrants.lastPositionSec, 0),
        ),
      )
      .orderBy(desc(schema.accessGrants.createdAt))
      .limit(10),
    db.execute<{ completed: number; hours: number; focus: number | null }>(sql`
      select
        (select count(*)::int from seen where user_id = ${uid}) as completed,
        (select coalesce(sum(watched_sec), 0) / 3600.0 from watch_sessions where user_id = ${uid})::float as hours,
        (select avg(f.seconds) / 60.0 from focus_spans f join watch_sessions w on w.id = f.watch_session_id where w.user_id = ${uid})::float as focus
    `).then((r) => r.rows),
    // Taste: likes weigh 3, dislikes -3, completed views 2, requests 1
    db.execute<{ genre: string; w: number }>(sql`
      select g as genre, sum(w)::float as w from (
        select t.genres, l.value * 3 as w from likes l join titles t on t.id = l.title_id where l.user_id = ${uid}
        union all
        select t.genres, case when ws.completed then 2 else 1 end from watch_sessions ws join titles t on t.id = ws.title_id where ws.user_id = ${uid}
        union all
        select t.genres, 1 from requests r join titles t on t.id = r.title_id where r.user_id = ${uid}
      ) x, unnest(x.genres) g
      group by g having sum(w) > 0 order by 2 desc limit 6
    `).then((r) => r.rows),
    db
      .select({ title: schema.titles })
      .from(schema.seen)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.seen.titleId))
      .where(eq(schema.seen.userId, uid))
      .orderBy(desc(schema.seen.createdAt)),
    db.execute<{ years: number | null }>(sql`
      select recency_years as years from requests where user_id = ${uid}
      union all
      select extract(year from ws.started_at)::int - t.year from watch_sessions ws join titles t on t.id = ws.title_id where ws.user_id = ${uid}
    `).then((r) => r.rows),
  ]);

  const toAsk = (await Promise.all(seeds.map((s) => similar(s.kind as "movie" | "tv", s.tmdbId)))).flat();
  const askReady = await readyTitleIds(toAsk.map((t) => t.id));
  const likedReady = await readyTitleIds(liked.map((l) => l.title.id));
  const listReady = await readyTitleIds(listed.map((l) => l.title.id));
  const seenReady = await readyTitleIds(seenRows.map((l) => l.title.id));
  const uniqueAsk = [...new Map(toAsk.filter((t) => !askReady.has(t.id)).map((t) => [t.id, t])).values()].slice(0, 18);

  const tasteTotal = tasteRows.reduce((s, r) => s + r.w, 0) || 1;
  const taste = tasteRows.map((r) => ({ label: r.genre, share: r.w / tasteTotal }));
  const recCount = new Map<string, number>();
  recencyRows.forEach((r) => {
    const b = recencyBucket(r.years);
    if (b !== "Inconnu") recCount.set(b, (recCount.get(b) ?? 0) + 1);
  });
  const recTotal = [...recCount.values()].reduce((a, b) => a + b, 0) || 1;
  const recency = recencyOrder.filter((b) => b !== "Inconnu").map((b) => ({ label: b, share: (recCount.get(b) ?? 0) / recTotal }));

  return (
    <main className="px-4 py-8 md:px-10 md:py-10">
      <header className="border-b border-line pb-8">
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-xs uppercase tracking-widest text-lime">{roleLabel[user.role]}</p>
          <div className="flex gap-2">
          <Link
            href="/bug?from=/me"
            aria-label="Signaler un bug"
            className="flex h-10 items-center gap-2 border border-line px-3 text-sm transition-colors hover:border-lime hover:text-lime"
          >
            <Bug size={15} />
            <span className="hidden sm:inline">Un souci ?</span>
          </Link>
          <form action={logout}>
            <button
              aria-label="Déconnexion"
              className="flex h-10 items-center gap-2 border border-line px-3 text-sm transition-colors hover:border-coral hover:text-coral"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </form>
          </div>
        </div>
        <h1 className="mt-3 break-all font-display text-5xl font-extrabold tracking-tighter md:text-8xl">@{user.handle}</h1>

        <dl className="mt-8 grid grid-cols-5 gap-px bg-line">
          <Stat label="Vus" value={stats.completed} />
          <Stat label="Heures" value={stats.hours} decimals={1} unit="h" />
          <Stat label="Focus" value={stats.focus ?? 0} unit="min" />
          <Stat label="Demandes" value={reqs.length} />
          <Stat label="Aimés" value={liked.length} />
        </dl>
      </header>

      <MeTabs
        overview={{
          watching: watching.map((w) => ({
            grantId: w.grantId,
            name: w.title.name,
            backdrop: img(w.title.backdropPath, "w780"),
            progress: w.dur ? Math.min(1, w.pos / w.dur) : 0,
            daysLeft: Math.max(0, Math.ceil((w.exp.getTime() - Date.now()) / 86400_000)),
          })),
          taste,
          recency: recencyRows.length ? recency : [],
          recos: recos.map((t) => toPoster(t, true)),
          listed: listed.map((l) => toPoster(l.title, listReady.has(l.title.id))),
          toAsk: uniqueAsk.map((t) => toPoster(t)),
        }}
        liked={liked.map((l) => toPoster(l.title, likedReady.has(l.title.id)))}
        seen={seenRows.map((l) => toPoster(l.title, seenReady.has(l.title.id)))}
        requests={reqs.map(({ req, title }) => ({
          id: req.id,
          status: req.status,
          reason: req.rejectReason,
          at: req.createdAt.toISOString(),
          prefs: req.prefs,
          poster: toPoster(title),
        }))}
        profile={{ handle: user.handle, age: user.ageBracket ?? "", sex: user.sex ?? "", hasPhone: user.hasPhone, optIn: user.whatsappOptIn }}
      />
    </main>
  );
}
