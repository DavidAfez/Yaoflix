import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { img, localize, searchTitles } from "@/lib/tmdb";
import { rateLimit } from "@/lib/ratelimit";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set("le la les un une des de du et a au aux en dans pour pas que qui quoi c est ce cette ces mon ma mes ton ta tes son sa ses sur avec film serie vu vue hier soir trop tres bien ouf finalement j je tu il elle on nous vous ils elles the a of and to".split(" "));

/**
 * Finds a film or series named in a draft post. Phrases of 2 to 5 words are matched inside known
 * titles (local cache first, TMDB second); a single word must be a whole title on its own.
 */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ match: null }, { status: 401 });
  if (!rateLimit(`mention:${user.id}`, 40, 30)) return NextResponse.json({ match: null });
  const words = norm(new URL(req.url).searchParams.get("text") ?? "").split(" ").filter(Boolean).slice(0, 60);
  const phrases: string[] = [];
  for (let n = 5; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const w = words.slice(i, i + n);
      if (w.every((x) => STOP.has(x))) continue;
      const p = w.join(" ");
      if (n === 1 ? p.length >= 4 && !STOP.has(p) : p.length >= 7) phrases.push(p);
    }
  }
  for (const p of phrases.slice(0, 40)) {
    const exact = p.split(" ").length === 1;
    const rows = (
      await db.execute<{ id: number }>(sql`
        select id from titles
        where ${exact ? sql`lower(name) = ${p} or lower(original_name) = ${p}` : sql`lower(translate(name, 'àâäéèêëîïôöùûüç:''-', 'aaaeeeeiioouuuc   ')) like ${`%${p}%`}`}
        order by popularity desc nulls last limit 1
      `)
    ).rows;
    if (rows[0]) return found(rows[0].id, p);
  }
  // Nothing cached: ask TMDB once with the longest multi-word phrase
  const longest = phrases.find((p) => p.split(" ").length >= 2);
  if (longest) {
    const hit = (await searchTitles(longest).catch(() => [])).find((t) => norm(t.name).includes(longest) || norm(t.originalName ?? "").includes(longest));
    if (hit) return found(hit.id, longest);
  }
  return NextResponse.json({ match: null });
}

async function found(id: number, phrase: string) {
  const rows = await db.select().from(schema.titles).where(eq(schema.titles.id, id));
  const [t] = await localize(rows);
  if (!t) return NextResponse.json({ match: null });
  return NextResponse.json({ match: { kind: t.kind, tmdbId: t.tmdbId, name: t.name, year: t.year, poster: img(t.posterPath, "w342"), phrase } });
}
