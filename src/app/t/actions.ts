"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { requestContext } from "@/lib/context";
import { createGrant } from "@/lib/access";
import { rateLimit } from "@/lib/ratelimit";

const prefsSchema = z.object({
  quality: z.enum(["auto", "480", "720", "1080", "2160"]),
  audio: z.enum(["any", "vf", "vo"]),
  subs: z.enum(["none", "fr", "en"]),
});

async function snapshot(user: { ageBracket: string | null; sex: string | null }, titleId: number) {
  const [t] = await db.select({ year: schema.titles.year }).from(schema.titles).where(eq(schema.titles.id, titleId));
  if (!t) throw new Error("Title not found");
  const ctx = await requestContext();
  return {
    ageBracket: user.ageBracket,
    sex: user.sex,
    country: ctx.country,
    recencyYears: t.year ? Math.max(0, new Date().getFullYear() - t.year) : null,
  };
}

async function readyMedia(titleId: number) {
  const [m] = await db
    .select({ id: schema.media.id })
    .from(schema.media)
    .where(and(eq(schema.media.titleId, titleId), eq(schema.media.status, "READY")))
    .orderBy(desc(schema.media.readyAt))
    .limit(1);
  return m ?? null;
}

export async function requestTitle(titleId: number, rawPrefs: unknown): Promise<{ ok: boolean; error?: string; watch?: string }> {
  const user = await requireUser();
  if (!user.emailVerifiedAt) return { ok: false, error: "Confirme ton email d'abord" };
  if (!rateLimit(`req:${user.id}`, 15, 86400)) return { ok: false, error: "Limite du jour atteinte" };
  const prefs = prefsSchema.parse(rawPrefs);

  const [open] = await db
    .select({ id: schema.requests.id })
    .from(schema.requests)
    .where(
      and(
        eq(schema.requests.userId, user.id),
        eq(schema.requests.titleId, titleId),
        inArray(schema.requests.status, ["PENDING", "IN_PROGRESS"]),
      ),
    );
  if (open) return { ok: true };

  const media = await readyMedia(titleId);
  const [req] = await db
    .insert(schema.requests)
    .values({
      userId: user.id,
      titleId,
      prefs,
      status: media ? "FULFILLED" : "PENDING",
      handledAt: media ? new Date() : null,
      ...(await snapshot(user, titleId)),
    })
    .returning({ id: schema.requests.id });

  if (media) {
    await createGrant({ userId: user.id, mediaId: media.id, requestId: req.id, prefs });
    const [g] = await db
      .select({ id: schema.accessGrants.id })
      .from(schema.accessGrants)
      .where(eq(schema.accessGrants.requestId, req.id));
    return { ok: true, watch: `/w/${g.id}` };
  }
  revalidatePath("/");
  return { ok: true };
}

/** Title already online: reuse a live grant or open a new one right away. */
export async function watchNow(titleId: number) {
  const user = await requireUser();
  const media = await readyMedia(titleId);
  if (!media) return;
  const [live] = await db
    .select({ id: schema.accessGrants.id })
    .from(schema.accessGrants)
    .where(
      and(
        eq(schema.accessGrants.userId, user.id),
        eq(schema.accessGrants.mediaId, media.id),
        gt(schema.accessGrants.expiresAt, new Date()),
        isNull(schema.accessGrants.revokedAt),
      ),
    )
    .limit(1);
  if (live) redirect(`/w/${live.id}`);
  const res = await requestTitle(titleId, { quality: "auto", audio: "any", subs: "none" });
  if (res.watch) redirect(res.watch);
}

export async function toggleWatchlist(titleId: number, path: string) {
  const user = await requireUser();
  const where = and(eq(schema.watchlist.userId, user.id), eq(schema.watchlist.titleId, titleId));
  const [row] = await db.select().from(schema.watchlist).where(where);
  if (row) await db.delete(schema.watchlist).where(where);
  else await db.insert(schema.watchlist).values({ userId: user.id, titleId });
  revalidatePath(path);
  return !row;
}

export async function setLike(titleId: number, value: 1 | -1 | 0, path?: string) {
  const user = await requireUser();
  const where = and(eq(schema.likes.userId, user.id), eq(schema.likes.titleId, titleId));
  if (value === 0) await db.delete(schema.likes).where(where);
  else
    await db
      .insert(schema.likes)
      .values({ userId: user.id, titleId, value })
      .onConflictDoUpdate({ target: [schema.likes.userId, schema.likes.titleId], set: { value, createdAt: new Date() } });
  if (path) revalidatePath(path);
}
