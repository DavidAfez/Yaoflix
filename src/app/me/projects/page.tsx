import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, Clapperboard } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { isCreator } from "@/lib/creators";
import { img } from "@/lib/tmdb";
import { getT } from "@/lib/i18n/server";
import { Projects, AskCreator } from "./projects";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Mes projets") };
}

export default async function Page() {
  const user = await requireUser();
  const t = await getT();
  const head = (
    <div className="mb-8 flex items-center gap-3">
      <Link href="/me" aria-label={t("Retour")} className="grid size-10 place-items-center border border-line hover:border-lime hover:text-lime">
        <ArrowLeft size={16} />
      </Link>
      <h1 className="flex items-center gap-3 font-display text-3xl font-extrabold md:text-5xl">
        <Clapperboard className="text-lime" /> {t("Mes projets")}
      </h1>
    </div>
  );
  if (!isCreator(user))
    return (
      <main className="mx-auto max-w-2xl px-4 pb-24 pt-8 md:px-10">
        {head}
        <AskCreator status={user.creator} />
      </main>
    );

  const rows = await db
    .select({ t: schema.titles, m: schema.media })
    .from(schema.titles)
    .leftJoin(schema.media, eq(schema.media.titleId, schema.titles.id))
    .where(eq(schema.titles.creatorId, user.id))
    .orderBy(desc(schema.titles.updatedAt));
  const projects = [...new Map(rows.map(({ t: x }) => [x.id, x])).values()].map((x) => ({
    id: x.id,
    tmdbId: x.tmdbId,
    kind: x.kind as "movie" | "tv",
    name: x.name,
    originalName: x.originalName ?? "",
    overview: x.overview ?? "",
    releaseDate: x.releaseDate ?? "",
    year: x.year,
    genres: x.genres,
    runtime: x.runtime,
    episodes: x.episodes,
    posterId: x.posterPath?.startsWith("img:") ? x.posterPath.slice(4) : null,
    backdropId: x.backdropPath?.startsWith("img:") ? x.backdropPath.slice(4) : null,
    poster: img(x.posterPath),
    crew: x.credits?.crew ?? [],
    cast: x.credits?.cast ?? [],
    media: rows.filter((r) => r.t.id === x.id && r.m).map((r) => ({ id: r.m!.id, status: r.m!.status, progress: r.m!.progress })),
  }));

  return (
    <main className="px-4 pb-24 pt-8 md:px-10">
      {head}
      <Projects projects={projects} />
    </main>
  );
}
