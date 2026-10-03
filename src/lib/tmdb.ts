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
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.TMDB_TOKEN}`, accept: "application/json" },
    next: { revalidate: 3600 },
  });
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

async function upsert(rows: (typeof schema.titles.$inferInsert)[]): Promise<TitleRow[]> {
  if (!rows.length) return [];
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
      return upsert(
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
    return upsert(data.results.slice(0, 12).map((it) => toRow(it, kind)));
  } catch {
    return [];
  }
}
