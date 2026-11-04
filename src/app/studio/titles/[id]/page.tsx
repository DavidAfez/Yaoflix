import { notFound } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { img } from "@/lib/tmdb";
import { getT } from "@/lib/i18n/server";
import { SheetEditor } from "./sheet";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Fiche du titre") };
}

/** Staff fill the sheet of a title asked for by hand (TMDB doesn't know it). */
export default async function Page(props: PageProps<"/studio/titles/[id]">) {
  await requireRole(can.upload);
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const [x] = await db
    .select()
    .from(schema.titles)
    .where(and(eq(schema.titles.id, id), sql`${schema.titles.tmdbId} < 0`, isNull(schema.titles.creatorId)));
  if (!x) notFound();
  return (
    <SheetEditor
      value={{
        id: x.id,
        tmdbId: x.tmdbId,
        kind: x.kind as "movie" | "tv",
        name: x.name,
        originalName: x.originalName ?? "",
        overview: x.overview ?? "",
        releaseDate: x.releaseDate ?? (x.year ? `${x.year}-01-01` : ""),
        year: x.year,
        genres: x.genres,
        runtime: x.runtime,
        episodes: x.episodes,
        posterId: x.posterPath?.startsWith("img:") ? x.posterPath.slice(4) : null,
        backdropId: x.backdropPath?.startsWith("img:") ? x.backdropPath.slice(4) : null,
        poster: img(x.posterPath),
        crew: x.credits?.crew ?? [{ job: "Réalisation", names: [] }],
        cast: x.credits?.cast ?? [],
        media: [],
      }}
    />
  );
}
