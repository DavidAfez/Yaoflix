import "server-only";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { TitleDetails } from "@/db/schema";
import type { TitleRow } from "./tmdb";

/**
 * Music and books, metadata only (no files): Deezer for albums, Open Library for books.
 * Both are free and need no key. Like TMDB, whatever members see is kept here, so the
 * catalogue grows with what people look for, never the whole database.
 */
export type LibraryKind = "album" | "book";
export const isLibrary = (kind: string): kind is LibraryKind => kind === "album" || kind === "book";

const UA = { "User-Agent": "GabaoFlix/1.0 (private film club)", accept: "application/json" };

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA, next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json() as Promise<T>;
}

type Row = typeof schema.titles.$inferInsert;

async function save(rows: Row[]): Promise<TitleRow[]> {
  const unique = [...new Map(rows.map((r) => [`${r.kind}:${r.tmdbId}`, r])).values()];
  if (!unique.length) return [];
  return db
    .insert(schema.titles)
    .values(unique)
    .onConflictDoUpdate({
      target: [schema.titles.tmdbId, schema.titles.kind],
      set: {
        name: sql`excluded.name`,
        byline: sql`coalesce(excluded.byline, titles.byline)`,
        posterPath: sql`coalesce(excluded.poster_path, titles.poster_path)`,
        year: sql`coalesce(excluded.year, titles.year)`,
        releaseDate: sql`coalesce(excluded.release_date, titles.release_date)`,
        overview: sql`coalesce(excluded.overview, titles.overview)`,
        genres: sql`case when cardinality(excluded.genres) > 0 then excluded.genres else titles.genres end`,
        runtime: sql`coalesce(excluded.runtime, titles.runtime)`,
        details: sql`coalesce(titles.details, '{}'::jsonb) || coalesce(excluded.details, '{}'::jsonb)`,
        updatedAt: new Date(),
      },
    })
    .returning();
}

/* ---------- Deezer (albums) ---------- */

type DzAlbum = {
  id: number;
  title: string;
  cover_xl?: string;
  cover_big?: string;
  artist?: { name: string };
  release_date?: string;
  genres?: { data: { name: string }[] };
  label?: string;
  duration?: number;
  link?: string;
  tracks?: { data: { title: string; duration?: number }[] };
};

const fromDeezer = (a: DzAlbum, full = false): Row => ({
  kind: "album",
  tmdbId: a.id,
  name: a.title,
  byline: a.artist?.name ?? null,
  posterPath: a.cover_xl ?? a.cover_big ?? null,
  year: a.release_date ? Number(a.release_date.slice(0, 4)) || null : null,
  releaseDate: a.release_date && /^\d{4}-\d{2}-\d{2}$/.test(a.release_date) && !a.release_date.startsWith("0000") ? a.release_date : null,
  genres: a.genres?.data.map((g) => g.name).slice(0, 4) ?? [],
  runtime: a.duration ? Math.round(a.duration / 60) : null,
  details: full
    ? ({
        tracks: (a.tracks?.data ?? []).map((t, i) => ({ n: i + 1, title: t.title, sec: t.duration ?? null })),
        label: a.label ?? null,
        link: a.link ?? null,
      } satisfies TitleDetails)
    : null,
});

/* ---------- Open Library (books) ---------- */

type OlDoc = { key: string; title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number; subject?: string[]; number_of_pages_median?: number; publisher?: string[] };
type OlWork = { title: string; description?: string | { value: string }; subjects?: string[]; covers?: number[] };

// "/works/OL45883W" → 45883, kept in the numeric id column
const olId = (key: string) => Number(key.match(/OL(\d+)W/)?.[1] ?? NaN);
const cover = (id?: number) => (id && id > 0 ? `https://covers.openlibrary.org/b/id/${id}-L.jpg` : null);

const fromOpenLibrary = (d: OlDoc): Row | null => {
  const id = olId(d.key);
  if (!Number.isFinite(id)) return null;
  return {
    kind: "book",
    tmdbId: id,
    name: d.title,
    byline: d.author_name?.slice(0, 3).join(", ") ?? null,
    posterPath: cover(d.cover_i),
    year: d.first_publish_year ?? null,
    genres: (d.subject ?? []).slice(0, 4),
    details: d.number_of_pages_median || d.publisher?.[0] ? { pages: d.number_of_pages_median ?? null, publisher: d.publisher?.[0] ?? null, link: `https://openlibrary.org${d.key}` } : { link: `https://openlibrary.org${d.key}` },
  };
};

const OL_FIELDS = "key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median,publisher";

/* ---------- What the site uses ---------- */

/** Search one shelf. Titles added by hand (negative ids) come first; offline, only those and the cache. */
export async function searchLibrary(kind: LibraryKind, q: string): Promise<TitleRow[]> {
  const query = q.trim().slice(0, 100);
  if (!query) return [];
  const local = await db
    .select()
    .from(schema.titles)
    .where(and(eq(schema.titles.kind, kind), or(ilike(schema.titles.name, `%${query}%`), ilike(schema.titles.byline, `%${query}%`))))
    .orderBy(desc(schema.titles.updatedAt))
    .limit(24);
  try {
    const remote =
      kind === "album"
        ? (await get<{ data: DzAlbum[] }>(`https://api.deezer.com/search/album?limit=24&q=${encodeURIComponent(query)}`)).data.map((a) => fromDeezer(a))
        : (await get<{ docs: OlDoc[] }>(`https://openlibrary.org/search.json?limit=24&fields=${OL_FIELDS}&q=${encodeURIComponent(query)}`)).docs.map(fromOpenLibrary).filter((r): r is Row => r !== null);
    const saved = await save(remote);
    const ids = new Set(saved.map((r) => r.id));
    return [...local.filter((r) => r.tmdbId < 0 && !ids.has(r.id)), ...saved];
  } catch (e) {
    const { logError } = await import("./errors");
    await logError("server", e, { where: `library.search.${kind}` });
    return local;
  }
}

/** One album or book, refreshed from its source when possible. */
export async function getLibraryItem(kind: LibraryKind, id: number): Promise<TitleRow | null> {
  if (id > 0) {
    try {
      if (kind === "album") {
        const [row] = await save([fromDeezer(await get<DzAlbum>(`https://api.deezer.com/album/${id}`), true)]);
        return row;
      }
      const w = await get<OlWork>(`https://openlibrary.org/works/OL${id}W.json`);
      const description = typeof w.description === "string" ? w.description : (w.description?.value ?? null);
      // The search gave author and year; the work page adds the synopsis and the subjects
      await db
        .insert(schema.titles)
        .values({ kind: "book", tmdbId: id, name: w.title, overview: description?.slice(0, 3000) ?? null, posterPath: cover(w.covers?.[0]), genres: (w.subjects ?? []).slice(0, 4) })
        .onConflictDoUpdate({
          target: [schema.titles.tmdbId, schema.titles.kind],
          set: {
            name: sql`excluded.name`,
            overview: sql`coalesce(excluded.overview, titles.overview)`,
            posterPath: sql`coalesce(titles.poster_path, excluded.poster_path)`,
            genres: sql`case when cardinality(titles.genres) > 0 then titles.genres else excluded.genres end`,
            updatedAt: new Date(),
          },
        });
    } catch (e) {
      const { logError } = await import("./errors");
      await logError("server", e, { where: `library.get.${kind}`, id });
    }
  }
  const [row] = await db.select().from(schema.titles).where(and(eq(schema.titles.kind, kind), eq(schema.titles.tmdbId, id)));
  return row ?? null;
}

/** What's popular right now on the source, for the shelf's front page. */
export async function trendingLibrary(kind: LibraryKind): Promise<TitleRow[]> {
  try {
    if (kind === "album") return save((await get<{ data: DzAlbum[] }>("https://api.deezer.com/chart/0/albums?limit=20")).data.map((a) => fromDeezer(a)));
    return save((await get<{ works: OlDoc[] }>("https://openlibrary.org/trending/weekly.json?limit=20")).works.map(fromOpenLibrary).filter((r): r is Row => r !== null));
  } catch {
    return [];
  }
}

/** The shelf as members made it: most liked, then most recently looked at. */
export async function memberShelf(kind: LibraryKind) {
  const liked = await db.execute<{ id: number }>(sql`
    select t.id from titles t join likes l on l.title_id = t.id and l.value = 1
    where t.kind = ${kind} group by t.id order by count(*) desc limit 20`);
  const ids = liked.rows.map((r) => r.id);
  const [top, recent] = await Promise.all([
    ids.length ? db.select().from(schema.titles).where(inArray(schema.titles.id, ids)) : Promise.resolve([] as TitleRow[]),
    db.select().from(schema.titles).where(eq(schema.titles.kind, kind)).orderBy(desc(schema.titles.updatedAt)).limit(20),
  ]);
  return { top: ids.map((id) => top.find((t) => t.id === id)).filter((t): t is TitleRow => Boolean(t)), recent };
}
