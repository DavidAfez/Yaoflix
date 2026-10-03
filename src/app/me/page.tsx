import { and, count, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { recommend, topLiked, readyTitleIds } from "@/lib/recos";
import { similar } from "@/lib/tmdb";
import { toPoster } from "@/lib/view";
import { roleLabel } from "@/lib/rbac";
import { MeTabs } from "./tabs";
import { logout } from "../(auth)/actions";

export const metadata = { title: "Moi" };

export default async function Page() {
  const user = await requireUser();
  const [recos, liked, reqs, [{ n: watched }], seeds] = await Promise.all([
    recommend(user, 18),
    db
      .select({ title: schema.titles })
      .from(schema.likes)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.likes.titleId))
      .where(and(eq(schema.likes.userId, user.id), eq(schema.likes.value, 1)))
      .orderBy(desc(schema.likes.createdAt)),
    db
      .select({ req: schema.requests, title: schema.titles })
      .from(schema.requests)
      .innerJoin(schema.titles, eq(schema.titles.id, schema.requests.titleId))
      .where(eq(schema.requests.userId, user.id))
      .orderBy(desc(schema.requests.createdAt))
      .limit(60),
    db.select({ n: count() }).from(schema.watchSessions).where(and(eq(schema.watchSessions.userId, user.id), eq(schema.watchSessions.completed, true))),
    topLiked(user.id),
  ]);

  const toAsk = (await Promise.all(seeds.map((s) => similar(s.kind as "movie" | "tv", s.tmdbId)))).flat();
  const askReady = await readyTitleIds(toAsk.map((t) => t.id));
  const likedReady = await readyTitleIds(liked.map((l) => l.title.id));
  const uniqueAsk = [...new Map(toAsk.filter((t) => !askReady.has(t.id)).map((t) => [t.id, t])).values()].slice(0, 18);

  return (
    <main className="px-4 py-10 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-lime">{roleLabel[user.role]}</p>
          <h1 className="mt-2 break-all font-display text-5xl font-extrabold tracking-tighter md:text-8xl">@{user.handle}</h1>
        </div>
        <dl className="flex gap-8 md:gap-12">
          {[
            ["Vus", watched],
            ["Demandes", reqs.length],
            ["Aimés", liked.length],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dd className="font-display text-4xl font-semibold tabular-nums md:text-5xl">{v}</dd>
              <dt className="font-mono text-[11px] uppercase tracking-widest text-dim">{k}</dt>
            </div>
          ))}
        </dl>
      </header>

      <MeTabs
        recos={recos.map((t) => toPoster(t, true))}
        toAsk={uniqueAsk.map((t) => toPoster(t))}
        liked={liked.map((l) => toPoster(l.title, likedReady.has(l.title.id)))}
        requests={reqs.map(({ req, title }) => ({
          id: req.id,
          status: req.status,
          reason: req.rejectReason,
          at: req.createdAt.toISOString(),
          poster: toPoster(title),
        }))}
        profile={{ age: user.ageBracket ?? "", sex: user.sex ?? "", hasPhone: user.hasPhone, optIn: user.whatsappOptIn }}
      />

      <form action={logout} className="mt-20 border-t border-line pt-6">
        <button className="text-sm text-dim hover:text-coral">Déconnexion</button>
      </form>
    </main>
  );
}
