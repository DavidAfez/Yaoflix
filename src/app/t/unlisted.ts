"use server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { nextLocalId, ownsImages } from "@/lib/creators";
import { rateLimit } from "@/lib/ratelimit";
import { requestTitle } from "./actions";

const input = z.object({
  kind: z.enum(["movie", "tv"]),
  name: z.string().trim().min(1, "Donne le titre").max(120),
  year: z.number().int().min(1888).max(new Date().getFullYear() + 3).nullable(),
  posterId: z.uuid().nullable(),
});

/**
 * A title TMDB doesn't have (or search can't find): the member names it, adds a poster so
 * everyone knows which one, and asks for it. It joins the catalogue for good, like any title:
 * it stays there after the video is gone or the link expires.
 */
export async function requestUnlisted(raw: z.input<typeof input>): Promise<{ ok: boolean; error?: string; href?: string }> {
  const user = await requireUser();
  if (!user.emailVerifiedAt) return { ok: false, error: "Confirme ton email d'abord" };
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalide" };
  const p = parsed.data;
  if (p.posterId && !(await ownsImages(user.id, [p.posterId]))) return { ok: false, error: "Interdit" };
  if (!rateLimit(`unlisted:${user.id}`, 5, 86400)) return { ok: false, error: "Limite du jour atteinte" };

  // Someone asked for the same one already: join that request instead of making a twin
  const [same] = await db
    .select({ id: schema.titles.id, tmdbId: schema.titles.tmdbId, kind: schema.titles.kind })
    .from(schema.titles)
    .where(
      and(
        sql`${schema.titles.tmdbId} < 0`,
        isNull(schema.titles.creatorId),
        eq(schema.titles.kind, p.kind),
        sql`lower(${schema.titles.name}) = lower(${p.name})`,
        p.year ? eq(schema.titles.year, p.year) : undefined,
      ),
    );
  const title =
    same ??
    (
      await db
        .insert(schema.titles)
        .values({ tmdbId: await nextLocalId(), kind: p.kind, name: p.name, year: p.year, releaseDate: null, posterPath: p.posterId ? `img:${p.posterId}` : null, genres: [] })
        .returning({ id: schema.titles.id, tmdbId: schema.titles.tmdbId, kind: schema.titles.kind })
    )[0];
  const r = await requestTitle(title.id, { quality: "auto", audio: "any", subs: "none" });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, href: `/t/${title.kind}/${title.tmdbId}` };
}
