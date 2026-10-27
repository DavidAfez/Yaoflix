import "server-only";
import { and, eq, ilike, or, sql, desc } from "drizzle-orm";
import { db, schema } from "@/db";

const API = "https://api.themoviedb.org/3";
export const img = (path: string | null | undefined, size: "w342" | "w500" | "w780" | "w1280" | "original" = "w500") =>
  path ? (path.startsWith("http") || path.startsWith("/media") ? path : `https://image.tmdb.org/t/p/${size}${path}`) : null;

const GENRES: Record<number, string> = {
  28: "Action", 12: "Aventure", 16: "Animation", 35: "Comédie", 80: "Crime", 99: "Documentaire",
  18: "Drame", 10751: "Famille", 14: "Fantastique", 36: "Histoire", 27: "Horreur", 10402: "Musique",
  9648: "Mystère", 10749: "Romance", 878: "Science-fiction", 10770: "Téléfilm", 53: "Thriller",
  10752: "Guerre", 37: "Western", 10759: "Action", 10762: "Kids", 10763: "News", 10764: "Réalité",
  10765: "Science-fiction", 10766: "Soap", 10767: "Talk", 10768: "Guerre",
};

type TmdbItem = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  runtime?: number;
  episode_run_time?: number[];
  vote_average?: number;
  popularity?: number;
};

export type TitleRow = typeof schema.titles.$inferSelect;

export const hasTmdb = () => Boolean(process.env.TMDB_TOKEN);

async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(API + path);
  url.searchParams.set("language", "fr-FR");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Accept both TMDB credentials: the long "Read Access Token" (Bearer) or the short v3 "API key" (query param)
  const token = (process.env.TMDB_TOKEN ?? "").trim();
  const headers: Record<string, string> = { accept: "application/json" };
  if (token.startsWith("eyJ")) headers.Authorization = `Bearer ${token}`;
  else url.searchParams.set("api_key", token);
  const res = await fetch(url, { headers, next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

function toRow(it: TmdbItem, kind: "movie" | "tv"): typeof schema.titles.$inferInsert {
  const release = it.release_date || it.first_air_date || null;
  const genres = it.genres?.map((g) => GENRES[g.id] ?? g.name) ?? (it.genre_ids ?? []).map((g) => GENRES[g]).filter(Boolean);
  return {
    tmdbId: it.id,
    kind,
    name: it.title ?? it.name ?? "Sans titre",
    originalName: it.original_title ?? it.original_name ?? null,
    overview: it.overview || null,
    posterPath: it.poster_path ?? null,
    backdropPath: it.backdrop_path ?? null,
    releaseDate: release || null,
    year: release ? Number(release.slice(0, 4)) : null,
    genres: [...new Set(genres)],
    runtime: it.runtime ?? it.episode_run_time?.[0] ?? null,
    voteAverage: it.vote_average ?? null,
    popularity: it.popularity ?? null,
    updatedAt: new Date(),
  };
}

// Upserts run one at a time: several rows of the home page (genres, top rated) often carry the same
// titles, and parallel "insert ... on conflict do update" on overlapping rows can deadlock
let upsertChain: Promise<unknown> = Promise.resolve();

async function upsert(input: (typeof schema.titles.$inferInsert)[]): Promise<TitleRow[]> {
  // The same title twice in one statement makes Postgres refuse the whole insert
  const seenKeys = new Set<string>();
  const rows = input.filter((r) => {
    const k = `${r.kind}:${r.tmdbId}`;
    if (seenKeys.has(k)) return false;
    seenKeys.add(k);
    return true;
  });
  if (!rows.length) return [];
  const run = upsertChain.then(() => upsertNow(rows));
  upsertChain = run.catch(() => undefined);
  return run;
}

async function upsertNow(rows: (typeof schema.titles.$inferInsert)[]): Promise<TitleRow[]> {
  return db
    .insert(schema.titles)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.titles.tmdbId, schema.titles.kind],
      set: {
        name: sql`excluded.name`,
        overview: sql`excluded.overview`,
        posterPath: sql`excluded.poster_path`,
        backdropPath: sql`excluded.backdrop_path`,
        releaseDate: sql`excluded.release_date`,
        year: sql`excluded.year`,
        genres: sql`case when cardinality(excluded.genres) > 0 then excluded.genres else titles.genres end`,
        runtime: sql`coalesce(excluded.runtime, titles.runtime)`,
        voteAverage: sql`excluded.vote_average`,
        popularity: sql`excluded.popularity`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
}

function pickKind(it: TmdbItem): "movie" | "tv" | null {
  if (it.media_type === "movie" || it.media_type === "tv") return it.media_type;
  return null;
}

/** Search TMDB (movies + series), cache results locally. Falls back to the local cache offline. */
export async function searchTitles(q: string): Promise<TitleRow[]> {
  const query = q.trim().slice(0, 100);
  if (!query) return [];
  if (hasTmdb()) {
    try {
      const data = await tmdb<{ results: TmdbItem[] }>("/search/multi", { query, include_adult: "false" });
      const rows = data.results
        .map((it) => {
          const kind = pickKind(it);
          return kind ? toRow(it, kind) : null;
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .slice(0, 24);
      const saved = await upsert(rows);
      const order = new Map(rows.map((r, i) => [`${r.kind}:${r.tmdbId}`, i]));
      return saved.sort((a, b) => (order.get(`${a.kind}:${a.tmdbId}`)! - order.get(`${b.kind}:${b.tmdbId}`)!));
    } catch (e) {
      const { logError } = await import("./errors");
      await logError("server", e, { where: "tmdb.search" });
    }
  }
  return db
    .select()
    .from(schema.titles)
    .where(or(ilike(schema.titles.name, `%${query}%`), ilike(schema.titles.originalName, `%${query}%`)))
    .orderBy(desc(schema.titles.popularity))
    .limit(24);
}

export async function trending(): Promise<TitleRow[]> {
  if (hasTmdb()) {
    try {
      const data = await tmdb<{ results: TmdbItem[] }>("/trending/all/week");
      return await upsert(
        data.results
          .map((it) => {
            const kind = pickKind(it);
            return kind ? toRow(it, kind) : null;
          })
          .filter((r): r is NonNullable<typeof r> => r !== null),
      );
    } catch (e) {
      const { logError } = await import("./errors");
      await logError("server", e, { where: "tmdb.trending" });
    }
  }
  return db.select().from(schema.titles).orderBy(desc(schema.titles.popularity)).limit(20);
}

/** Get a title from the cache, refreshing details (genres, runtime) from TMDB when possible. */
export async function getTitle(kind: "movie" | "tv", tmdbId: number): Promise<TitleRow | null> {
  if (hasTmdb()) {
    try {
      const it = await tmdb<TmdbItem>(`/${kind}/${tmdbId}`);
      const [row] = await upsert([toRow(it, kind)]);
      return row;
    } catch (e) {
      const { logError } = await import("./errors");
      await logError("server", e, { where: "tmdb.details", kind, tmdbId });
    }
  }
  const [row] = await db
    .select()
    .from(schema.titles)
    .where(and(eq(schema.titles.kind, kind), eq(schema.titles.tmdbId, tmdbId)))
    .limit(1);
  return row ?? null;
}

/** TMDB "recommendations" for a title, used to suggest things to request. */
export async function similar(kind: "movie" | "tv", tmdbId: number): Promise<TitleRow[]> {
  if (!hasTmdb()) return [];
  try {
    const data = await tmdb<{ results: TmdbItem[] }>(`/${kind}/${tmdbId}/recommendations`);
    return await upsert(data.results.slice(0, 12).map((it) => toRow(it, kind)));
  } catch {
    return [];
  }
}

/** Best rated titles (TMDB top rated), cached locally. Offline: best vote average in the local cache. */
export async function topRated(kind: "movie" | "tv"): Promise<TitleRow[]> {
  if (hasTmdb()) {
    try {
      const pages = await Promise.all(["1", "2"].map((page) => tmdb<{ results: TmdbItem[] }>(`/${kind}/top_rated`, { page })));
      return await upsert(pages.flatMap((p) => p.results).slice(0, 30).map((it) => toRow(it, kind)));
    } catch (e) {
      const { logError } = await import("./errors");
      await logError("server", e, { where: "tmdb.topRated", kind });
    }
  }
  return db
    .select()
    .from(schema.titles)
    .where(eq(schema.titles.kind, kind))
    .orderBy(desc(schema.titles.voteAverage), desc(schema.titles.popularity))
    .limit(30);
}

/** Genre rows for the home page. TMDB genre ids differ between movies and series. */
export const GENRE_ROWS: Record<"movie" | "tv", { id: number; name: string; local: string }[]> = {
  movie: [
    { id: 28, name: "Action", local: "Action" },
    { id: 35, name: "Comédie", local: "Comédie" },
    { id: 18, name: "Drame", local: "Drame" },
    { id: 878, name: "Science-fiction", local: "Science-fiction" },
    { id: 53, name: "Thriller", local: "Thriller" },
    { id: 16, name: "Animation", local: "Animation" },
    { id: 27, name: "Horreur", local: "Horreur" },
    { id: 10749, name: "Romance", local: "Romance" },
    { id: 80, name: "Crime", local: "Crime" },
    { id: 99, name: "Documentaire", local: "Documentaire" },
  ],
  tv: [
    { id: 18, name: "Drame", local: "Drame" },
    { id: 35, name: "Comédie", local: "Comédie" },
    { id: 80, name: "Crime", local: "Crime" },
    { id: 10765, name: "Science-fiction et fantastique", local: "Science-fiction" },
    { id: 10759, name: "Action et aventure", local: "Action" },
    { id: 16, name: "Animation", local: "Animation" },
    { id: 9648, name: "Mystère", local: "Mystère" },
    { id: 99, name: "Documentaire", local: "Documentaire" },
  ],
};

/** Popular, well rated titles of one genre. Offline: the local cache filtered by genre. */
export async function byGenre(kind: "movie" | "tv", genre: { id: number; local: string }, limit = 20): Promise<TitleRow[]> {
  if (hasTmdb()) {
    try {
      const data = await tmdb<{ results: TmdbItem[] }>(`/discover/${kind}`, {
        with_genres: String(genre.id),
        sort_by: "popularity.desc",
        "vote_count.gte": "300",
        include_adult: "false",
      });
      return await upsert(data.results.slice(0, limit).map((it) => toRow(it, kind)));
    } catch (e) {
      const { logError } = await import("./errors");
      await logError("server", e, { where: "tmdb.byGenre", kind, genre: genre.id });
    }
  }
  return db
    .select()
    .from(schema.titles)
    .where(and(eq(schema.titles.kind, kind), sql`${genre.local} = any(${schema.titles.genres})`))
    .orderBy(desc(schema.titles.popularity))
    .limit(limit);
}

/** Africa as a whole: TMDB filters by country of origin, several at once with "|". */
export const AFRICA = ["NG", "ZA", "SN", "CI", "CM", "GA", "CG", "CD", "GH", "KE", "BF", "ML", "BJ", "TG", "MA", "DZ", "TN", "EG", "ET", "RW", "TZ", "UG", "AO", "MZ"];

export const COUNTRY_ROWS: { name: string; codes: string[] }[] = [
  { name: "Afrique", codes: AFRICA },
  { name: "France", codes: ["FR"] },
  { name: "Corée du Sud", codes: ["KR"] },
  { name: "Japon", codes: ["JP"] },
  { name: "Inde", codes: ["IN"] },
  { name: "Espagne", codes: ["ES"] },
  { name: "Royaume-Uni", codes: ["GB"] },
];

/** Popular titles made in one or several countries. Offline: nothing, the cache does not keep the country. */
export async function byCountry(kind: "movie" | "tv", codes: string[], opts: { genre?: number; limit?: number } = {}): Promise<TitleRow[]> {
  if (!hasTmdb()) return [];
  const african = codes.some((c) => AFRICA.includes(c));
  try {
    const data = await tmdb<{ results: TmdbItem[] }>(`/discover/${kind}`, {
      with_origin_country: codes.join("|"),
      sort_by: "popularity.desc",
      // African productions are far less rated on TMDB: a low bar keeps the row full
      "vote_count.gte": african ? "5" : "100",
      include_adult: "false",
      ...(opts.genre ? { with_genres: String(opts.genre) } : {}),
    });
    return await upsert(data.results.filter((it) => it.poster_path).slice(0, opts.limit ?? 20).map((it) => toRow(it, kind)));
  } catch (e) {
    const { logError } = await import("./errors");
    await logError("server", e, { where: "tmdb.byCountry", kind, codes: codes.join("|") });
    return [];
  }
}

/**
 * The great classics: at least 25 years old, widely seen and highly rated.
 * Offline: the oldest best rated titles of the local cache.
 */
export async function classics(kind: "movie" | "tv" = "movie", limit = 40): Promise<TitleRow[]> {
  const before = new Date().getFullYear() - 25;
  if (hasTmdb()) {
    try {
      const dateKey = kind === "movie" ? "primary_release_date.lte" : "first_air_date.lte";
      const pages = await Promise.all(
        ["1", "2", "3"].map((page) =>
          tmdb<{ results: TmdbItem[] }>(`/discover/${kind}`, {
            [dateKey]: `${before}-12-31`,
            sort_by: "vote_average.desc",
            "vote_count.gte": kind === "movie" ? "3000" : "500",
            include_adult: "false",
            page,
          }),
        ),
      );
      return await upsert(pages.flatMap((p) => p.results).slice(0, limit).map((it) => toRow(it, kind)));
    } catch (e) {
      const { logError } = await import("./errors");
      await logError("server", e, { where: "tmdb.classics", kind });
    }
  }
  return db
    .select()
    .from(schema.titles)
    .where(and(eq(schema.titles.kind, kind), sql`${schema.titles.year} <= ${before}`))
    .orderBy(desc(schema.titles.voteAverage))
    .limit(limit);
}

/** Slips a few titles into a row at regular intervals, without duplicates. */
export function interleave(base: TitleRow[], extra: TitleRow[], every = 4, max = 4): TitleRow[] {
  const ids = new Set(base.map((t) => t.id));
  const add = extra.filter((t) => !ids.has(t.id)).slice(0, max);
  const out = [...base];
  add.forEach((t, i) => out.splice(Math.min(out.length, 1 + i * every), 0, t));
  return out;
}

export type Credits = {
  companies: string[];
  networks: string[];
  crew: { job: string; names: string[] }[];
  cast: { name: string; role: string | null; photo: string | null }[];
};

type Person = { name: string; job?: string; character?: string; profile_path?: string | null; roles?: { character: string }[]; jobs?: { job: string }[] };

const JOBS: [string, string][] = [
  ["Director", "Réalisation"],
  ["Screenplay", "Scénario"],
  ["Writer", "Scénario"],
  ["Novel", "D'après"],
  ["Producer", "Production"],
  ["Executive Producer", "Production exécutive"],
  ["Original Music Composer", "Musique"],
  ["Director of Photography", "Image"],
  ["Editor", "Montage"],
];

/** Studios, crew and cast. Null when TMDB is out of reach: the section then stays hidden. */
export async function credits(kind: "movie" | "tv", tmdbId: number): Promise<Credits | null> {
  if (!hasTmdb()) return null;
  try {
    const extra = kind === "movie" ? "credits" : "aggregate_credits";
    const d = await tmdb<{
      production_companies?: { name: string }[];
      networks?: { name: string }[];
      created_by?: { name: string }[];
      credits?: { cast: Person[]; crew: Person[] };
      aggregate_credits?: { cast: Person[]; crew: Person[] };
    }>(`/${kind}/${tmdbId}`, { append_to_response: extra });
    const c = d.credits ?? d.aggregate_credits ?? { cast: [], crew: [] };
    const byJob = new Map<string, string[]>();
    if (d.created_by?.length) byJob.set("Création", d.created_by.map((p) => p.name));
    for (const [job, label] of JOBS) {
      const names = c.crew.filter((p) => p.job === job || p.jobs?.some((j) => j.job === job)).map((p) => p.name);
      if (names.length) byJob.set(label, [...new Set([...(byJob.get(label) ?? []), ...names])].slice(0, 6));
    }
    return {
      companies: (d.production_companies ?? []).map((x) => x.name).slice(0, 8),
      networks: (d.networks ?? []).map((x) => x.name),
      crew: [...byJob].map(([job, names]) => ({ job, names })),
      cast: c.cast.slice(0, 20).map((p) => ({
        name: p.name,
        role: p.character ?? p.roles?.[0]?.character ?? null,
        photo: p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null,
      })),
    };
  } catch {
    return null;
  }
}
