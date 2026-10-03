import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { img } from "@/lib/tmdb";
import { Queue, type QueueItem } from "./queue";

export default async function Page() {
  const rows = await db
    .select({ req: schema.requests, title: schema.titles })
    .from(schema.requests)
    .innerJoin(schema.titles, eq(schema.titles.id, schema.requests.titleId))
    .where(inArray(schema.requests.status, ["PENDING", "IN_PROGRESS"]))
    .orderBy(asc(schema.requests.createdAt));

  const byTitle = new Map<number, QueueItem & { _q: string[]; _a: string[]; _s: string[] }>();
  const top = (xs: string[]) => {
    const c = new Map<string, number>();
    xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  };
  for (const { req, title } of rows) {
    const it = byTitle.get(title.id) ?? {
      titleId: title.id,
      kind: title.kind,
      tmdbId: title.tmdbId,
      name: title.name,
      year: title.year,
      poster: img(title.posterPath, "w342"),
      count: 0,
      since: req.createdAt.toISOString(),
      claimed: false,
      quality: "",
      audio: "",
      subs: "",
      _q: [] as string[],
      _a: [] as string[],
      _s: [] as string[],
    };
    it.count++;
    it.claimed ||= req.status === "IN_PROGRESS";
    it._q.push(req.prefs.quality);
    it._a.push(req.prefs.audio);
    it._s.push(req.prefs.subs);
    byTitle.set(title.id, it);
  }
  const items = [...byTitle.values()]
    .map(({ _q, _a, _s, ...it }) => ({ ...it, quality: top(_q), audio: top(_a), subs: top(_s) }))
    .sort((a, b) => b.count - a.count || a.since.localeCompare(b.since));

  return <Queue items={items} />;
}
