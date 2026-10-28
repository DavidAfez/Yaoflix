"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { isCreator, nextLocalId, ownsImages } from "@/lib/creators";

const project = z.object({
  id: z.number().int().positive().optional(),
  kind: z.enum(["movie", "tv"]),
  name: z.string().trim().min(1, "Donne un titre").max(120),
  originalName: z.string().trim().max(120).optional(),
  overview: z.string().trim().max(2000).optional(),
  releaseDate: z.union([z.iso.date(), z.literal("")]).optional(),
  genres: z.array(z.string().trim().min(1).max(30)).max(4),
  runtime: z.number().int().min(1).max(600).nullable().optional(),
  episodes: z.number().int().min(1).max(500).nullable().optional(),
  posterId: z.uuid().nullable().optional(),
  backdropId: z.uuid().nullable().optional(),
  crew: z.array(z.object({ job: z.string().trim().min(1).max(40), names: z.array(z.string().trim().min(1).max(60)).min(1).max(10) })).max(10),
  cast: z.array(z.object({ name: z.string().trim().min(1).max(60), role: z.string().trim().max(60).nullable() })).max(30),
});
export type ProjectInput = z.input<typeof project>;

/** Creates or edits a project. It is stored like any catalogue title, with the creator attached. */
export async function saveProject(input: ProjectInput): Promise<{ ok: boolean; error?: string; id?: number; tmdbId?: number }> {
  const user = await requireUser();
  if (!isCreator(user)) return { ok: false, error: "Profil créateur requis" };
  const parsed = project.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalide" };
  const p = parsed.data;
  const images = [p.posterId, p.backdropId].filter((x): x is string => Boolean(x));
  if (!(await ownsImages(user.id, images))) return { ok: false, error: "Interdit" };
  const values = {
    kind: p.kind,
    name: p.name,
    originalName: p.originalName || null,
    overview: p.overview || null,
    releaseDate: p.releaseDate || null,
    year: p.releaseDate ? Number(p.releaseDate.slice(0, 4)) : new Date().getFullYear(),
    genres: p.genres,
    runtime: p.runtime ?? null,
    episodes: p.kind === "tv" ? (p.episodes ?? null) : null,
    posterPath: p.posterId ? `img:${p.posterId}` : null,
    backdropPath: p.backdropId ? `img:${p.backdropId}` : null,
    credits: { crew: p.crew, cast: p.cast },
    updatedAt: new Date(),
  };
  if (p.id) {
    const [t] = await db
      .update(schema.titles)
      .set(values)
      .where(and(eq(schema.titles.id, p.id), eq(schema.titles.creatorId, user.id)))
      .returning({ id: schema.titles.id, tmdbId: schema.titles.tmdbId });
    if (!t) return { ok: false, error: "Introuvable" };
    revalidatePath("/me/projects");
    return { ok: true, ...t };
  }
  const [t] = await db
    .insert(schema.titles)
    .values({ ...values, tmdbId: await nextLocalId(), creatorId: user.id })
    .returning({ id: schema.titles.id, tmdbId: schema.titles.tmdbId });
  revalidatePath("/me/projects");
  return { ok: true, ...t };
}

/** Removes a project with its videos. */
export async function deleteProject(id: number) {
  const user = await requireUser();
  const [t] = await db.select({ id: schema.titles.id }).from(schema.titles).where(and(eq(schema.titles.id, id), eq(schema.titles.creatorId, user.id)));
  if (!t) return;
  const media = await db.select({ id: schema.media.id }).from(schema.media).where(eq(schema.media.titleId, t.id));
  const { rm } = await import("node:fs/promises");
  const { paths } = await import("@/lib/storage");
  for (const m of media) {
    await rm(paths.hlsDir(m.id), { recursive: true, force: true });
    await rm(paths.source(m.id), { force: true });
  }
  await db.delete(schema.titles).where(eq(schema.titles.id, t.id));
  revalidatePath("/me/projects");
}

/** Asks staff for a creator profile, from the account rather than at sign-up. */
export async function requestCreator() {
  const user = await requireUser();
  await db
    .update(schema.users)
    .set({ creator: "requested" })
    .where(and(eq(schema.users.id, user.id), or(isNull(schema.users.creator), eq(schema.users.creator, "refused"))));
  revalidatePath("/me/projects");
}
