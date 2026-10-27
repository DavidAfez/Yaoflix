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
import { deepAllowed, markSeen, titleIdFor } from "@/lib/marks";
import { CRITERIA, TAGS } from "@/lib/deep";

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
  else {
    await db
      .insert(schema.likes)
      .values({ userId: user.id, titleId, value })
      .onConflictDoUpdate({ target: [schema.likes.userId, schema.likes.titleId], set: { value, createdAt: new Date() } });
    // An opinion means the title was seen
    await markSeen(user.id, titleId, "like");
    if (value === 1) await db.delete(schema.nevers).where(and(eq(schema.nevers.userId, user.id), eq(schema.nevers.titleId, titleId)));
  }
  if (path) revalidatePath(path);
}

/** Poster shortcuts: they only know kind + tmdbId. */
export async function likeByRef(kind: string, tmdbId: number, value: 1 | -1 | 0) {
  const titleId = await titleIdFor(kind, tmdbId);
  if (titleId) await setLike(titleId, value);
  // Refresh whatever page is open (profile lists, home rows) without a reload
  revalidatePath("/", "layout");
}

/** Score from 1 to 5, 0 removes it. A score means the title was seen. */
export async function rateByRef(kind: string, tmdbId: number, score: number) {
  const user = await requireUser();
  const titleId = await titleIdFor(kind, tmdbId);
  if (!titleId) return;
  const s = Math.max(0, Math.min(5, Math.round(score)));
  const where = and(eq(schema.ratings.userId, user.id), eq(schema.ratings.titleId, titleId));
  if (s === 0) await db.delete(schema.ratings).where(where);
  else {
    await db
      .insert(schema.ratings)
      .values({ userId: user.id, titleId, score: s })
      .onConflictDoUpdate({ target: [schema.ratings.userId, schema.ratings.titleId], set: { score: s, updatedAt: new Date() } });
    await markSeen(user.id, titleId, "rating");
  }
  revalidatePath("/", "layout");
}

/** Toggle "seen". Removing it also removes a like or dislike, which only made sense if seen. */
export async function setSeenByRef(kind: string, tmdbId: number, on: boolean) {
  const user = await requireUser();
  const titleId = await titleIdFor(kind, tmdbId);
  if (!titleId) return;
  if (on) await markSeen(user.id, titleId, "manual");
  else {
    await db.delete(schema.seen).where(and(eq(schema.seen.userId, user.id), eq(schema.seen.titleId, titleId)));
    await db.delete(schema.likes).where(and(eq(schema.likes.userId, user.id), eq(schema.likes.titleId, titleId)));
    await db.delete(schema.ratings).where(and(eq(schema.ratings.userId, user.id), eq(schema.ratings.titleId, titleId)));
  }
  revalidatePath("/", "layout");
}

/** "Never": removed from every suggestion and from the home rows. Mutually exclusive with a like. */
export async function setNeverByRef(kind: string, tmdbId: number, on: boolean) {
  const user = await requireUser();
  const titleId = await titleIdFor(kind, tmdbId);
  if (!titleId) return;
  const where = and(eq(schema.nevers.userId, user.id), eq(schema.nevers.titleId, titleId));
  if (on) {
    await db.insert(schema.nevers).values({ userId: user.id, titleId }).onConflictDoNothing();
    await db.delete(schema.likes).where(and(eq(schema.likes.userId, user.id), eq(schema.likes.titleId, titleId), eq(schema.likes.value, 1)));
  } else await db.delete(schema.nevers).where(where);
  revalidatePath("/", "layout");
}

const deepSchema = z.object({
  scores: z.partialRecord(z.enum(CRITERIA.map((c) => c.key) as [string, ...string[]]), z.number().int().min(1).max(5)),
  tags: z.array(z.enum(TAGS)).max(TAGS.length),
});

/** Detailed review, open to members granted by staff or with enough reviews. */
export async function saveDeepReview(kind: string, tmdbId: number, input: { scores: Record<string, number>; tags: string[] }) {
  const user = await requireUser();
  if (!(await deepAllowed(user.id))) return { ok: false };
  const parsed = deepSchema.safeParse(input);
  if (!parsed.success || !Object.keys(parsed.data.scores).length) return { ok: false };
  const titleId = await titleIdFor(kind, tmdbId);
  if (!titleId) return { ok: false };
  const tags = parsed.data.tags;
  const scores = parsed.data.scores as Record<string, number>;
  await db
    .insert(schema.deepReviews)
    .values({ userId: user.id, titleId, scores, tags })
    .onConflictDoUpdate({ target: [schema.deepReviews.userId, schema.deepReviews.titleId], set: { scores, tags, updatedAt: new Date() } });
  await markSeen(user.id, titleId, "review");
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The member's own detailed review of a title, to prefill the sheet. */
export async function getDeepReview(kind: string, tmdbId: number) {
  const user = await requireUser();
  const titleId = await titleIdFor(kind, tmdbId);
  if (!titleId) return null;
  const [r] = await db
    .select({ scores: schema.deepReviews.scores, tags: schema.deepReviews.tags })
    .from(schema.deepReviews)
    .where(and(eq(schema.deepReviews.userId, user.id), eq(schema.deepReviews.titleId, titleId)));
  return r ?? null;
}
