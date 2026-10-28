"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { rateLimit } from "@/lib/ratelimit";
import { titleIdFor } from "@/lib/marks";
import { notify } from "@/lib/notify-center";
import type { PostData } from "@/db/schema";

const refresh = () => revalidatePath("/", "layout");

const mediaSchema = z
  .array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("image"), id: z.uuid() }),
      z.object({ type: z.literal("frame"), clipId: z.uuid() }),
      z.object({ type: z.literal("gif"), url: z.string().startsWith("https://media.tenor.com/").max(400), w: z.number().int().min(0).max(4000), h: z.number().int().min(0).max(4000) }),
    ]),
  )
  .max(4);

const postSchema = z.object({
  body: z.string().trim().max(1000, "1000 caractères maximum"),
  media: mediaSchema.optional(),
  // Scheduled post: shown to others from that moment, up to 30 days ahead
  publishAt: z.iso.datetime({ offset: true }).optional(),
  kind: z.enum(["movie", "tv"]).optional(),
  tmdbId: z.number().int().refine((n) => n !== 0).optional(),
  parentId: z.uuid().optional(),
});

/** A new post, or a reply when parentId is set. */
export async function createPost(input: z.input<typeof postSchema>): Promise<{ ok: boolean; error?: string; id?: string }> {
  const user = await requireUser();
  if (!rateLimit(`post:${user.id}`, 10, 60)) return { ok: false, error: "Doucement, réessaie dans une minute." };
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { body, kind, tmdbId, parentId, media = [] } = parsed.data;
  if (!body && !media.length) return { ok: false, error: "Écris quelque chose" };
  if (!(await ownsMedia(user.id, media))) return { ok: false, error: "Interdit" };
  let createdAt: Date | undefined;
  if (parsed.data.publishAt && !parentId) {
    createdAt = new Date(parsed.data.publishAt);
    if (createdAt.getTime() < Date.now() - 60_000 || createdAt.getTime() > Date.now() + 30 * 86400_000) return { ok: false, error: "Date invalide" };
  }
  let titleId: number | null = null;
  if (parentId) {
    // A reply talks about the same title as the post it answers
    const [parent] = await db.select({ titleId: schema.posts.titleId, userId: schema.posts.userId }).from(schema.posts).where(eq(schema.posts.id, parentId));
    if (!parent) return { ok: false, error: "Post introuvable" };
    titleId = parent.titleId;
    await notify(parent.userId, "reply", { handle: user.handle, href: `/p/${parentId}` }, user.id);
  } else if (kind && tmdbId) titleId = await titleIdFor(kind, tmdbId);
  // GabaoFlix talks about films and series: a new post is always about one
  if (!parentId && !titleId) {
    const frame = media.find((m) => m.type === "frame");
    if (frame) [{ titleId }] = await db.select({ titleId: schema.clips.titleId }).from(schema.clips).where(eq(schema.clips.id, frame.clipId));
  }
  if (!parentId && !titleId) return { ok: false, error: "De quel film ou série tu parles ?" };
  const [p] = await db
    .insert(schema.posts)
    .values({ userId: user.id, body: body || null, titleId, parentId: parentId ?? null, media: media.length ? media : null, ...(createdAt ? { createdAt } : {}) })
    .returning({ id: schema.posts.id });
  refresh();
  return { ok: true, id: p.id };
}

/** Pictures and stills must belong to the author. */
async function ownsMedia(userId: string, media: z.infer<typeof mediaSchema>) {
  const imageIds = media.flatMap((m) => (m.type === "image" ? [m.id] : []));
  const frameIds = media.flatMap((m) => (m.type === "frame" ? [m.clipId] : []));
  if (imageIds.length) {
    const own = await db.select({ id: schema.images.id }).from(schema.images).where(and(eq(schema.images.userId, userId), inArray(schema.images.id, imageIds)));
    if (own.length !== new Set(imageIds).size) return false;
  }
  if (frameIds.length) {
    const own = await db.select({ id: schema.clips.id }).from(schema.clips).where(and(eq(schema.clips.userId, userId), eq(schema.clips.kind, "image"), inArray(schema.clips.id, frameIds)));
    if (own.length !== new Set(frameIds).size) return false;
  }
  return true;
}

async function pingAuthor(postId: string, kind: "fav" | "repost", user: { id: string; handle: string }) {
  const [p] = await db.select({ userId: schema.posts.userId }).from(schema.posts).where(eq(schema.posts.id, postId));
  if (p) await notify(p.userId, kind, { handle: user.handle, href: `/p/${postId}` }, user.id);
}

export async function toggleFav(postId: string, on: boolean) {
  const user = await requireUser();
  const where = and(eq(schema.postLikes.userId, user.id), eq(schema.postLikes.postId, postId));
  if (on) {
    await db.insert(schema.postLikes).values({ userId: user.id, postId }).onConflictDoNothing();
    await pingAuthor(postId, "fav", user);
  }
  else await db.delete(schema.postLikes).where(where);
  refresh();
}

/** A repost is an empty post pointing to the original. */
export async function toggleRepost(postId: string, on: boolean) {
  const user = await requireUser();
  const where = and(eq(schema.posts.userId, user.id), eq(schema.posts.repostOf, postId));
  if (on) {
    const [already] = await db.select({ id: schema.posts.id }).from(schema.posts).where(where);
    if (!already) {
      await db.insert(schema.posts).values({ userId: user.id, repostOf: postId });
      await pingAuthor(postId, "repost", user);
    }
  } else await db.delete(schema.posts).where(where);
  refresh();
}

/** Authors delete their posts; moderators delete anyone's. */
export async function deletePost(postId: string) {
  const user = await requireUser();
  const [p] = await db.select({ userId: schema.posts.userId }).from(schema.posts).where(eq(schema.posts.id, postId));
  if (!p || (p.userId !== user.id && !can.manageUsers(user.role))) return;
  await db.delete(schema.posts).where(eq(schema.posts.id, postId));
  refresh();
}

export async function setFollow(handle: string, on: boolean) {
  const user = await requireUser();
  const [target] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, handle));
  if (!target || target.id === user.id) return;
  const [blocked] = await db
    .select({ x: schema.blocks.blockerId })
    .from(schema.blocks)
    .where(or(and(eq(schema.blocks.blockerId, user.id), eq(schema.blocks.blockedId, target.id)), and(eq(schema.blocks.blockerId, target.id), eq(schema.blocks.blockedId, user.id))));
  if (on && blocked) return;
  if (on) {
    await db.insert(schema.follows).values({ followerId: user.id, followeeId: target.id }).onConflictDoNothing();
    await notify(target.id, "follow", { handle: user.handle, href: `/u/${user.handle}` }, user.id);
  }
  else await db.delete(schema.follows).where(and(eq(schema.follows.followerId, user.id), eq(schema.follows.followeeId, target.id)));
  refresh();
}

// A title as posts carry it. Posters must come from TMDB, nothing else is rendered as an image.
const titleRef = z.object({
  kind: z.enum(["movie", "tv"]),
  tmdbId: z.number().int().refine((n) => n !== 0),
  name: z.string().trim().min(1).max(200),
  year: z.number().int().nullable(),
  poster: z.string().startsWith("https://image.tmdb.org/").max(300).nullable(),
});
const tierItem = z.discriminatedUnion("type", [
  titleRef.extend({ type: z.literal("title") }),
  z.object({ type: z.literal("frame"), clipId: z.uuid(), label: z.string().trim().max(60).optional() }),
]);
const richSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("top5"), body: z.string().trim().max(1000).optional(), data: z.object({ title: z.string().trim().min(1, "Donne un titre").max(80), items: z.array(titleRef).min(1).max(5) }) }),
  z.object({
    kind: z.literal("tier"),
    body: z.string().trim().max(1000).optional(),
    data: z.object({
      title: z.string().trim().min(1, "Donne un titre").max(80),
      tiers: z.array(z.object({ label: z.string().trim().min(1).max(12), items: z.array(tierItem).max(24) })).min(2).max(7),
    }),
  }),
  z.object({
    kind: z.literal("poll"),
    body: z.string().trim().max(1000).optional(),
    data: z.object({
      question: z.string().trim().min(1, "Pose une question").max(200),
      options: z.array(z.object({ label: z.string().trim().min(1).max(80) })).min(2, "Au moins deux réponses").max(4),
      answer: z.number().int().min(0).max(3).nullable().optional(),
      frameId: z.uuid().nullable().optional(),
      ref: titleRef.nullable().optional(),
    }),
  }),
]);

/** Top 5, tier list or poll. Still frames must belong to the author. */
export async function createRichPost(input: { kind: "top5" | "tier" | "poll"; body?: string; data: unknown }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!rateLimit(`post:${user.id}`, 10, 60)) return { ok: false, error: "Doucement, réessaie dans une minute." };
  const parsed = richSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalide" };
  const { kind, body, data } = parsed.data;

  const frames =
    kind === "tier" ? data.tiers.flatMap((t) => t.items).flatMap((i) => (i.type === "frame" ? [i.clipId] : [])) : kind === "poll" && data.frameId ? [data.frameId] : [];
  if (frames.length) {
    const own = await db
      .select({ id: schema.clips.id })
      .from(schema.clips)
      .where(and(eq(schema.clips.userId, user.id), eq(schema.clips.kind, "image"), inArray(schema.clips.id, frames)));
    if (own.length !== new Set(frames).size) return { ok: false, error: "Interdit" };
  }
  if (kind === "poll" && data.answer != null && data.answer >= data.options.length) return { ok: false, error: "Invalide" };

  // A poll is about a title, or about a still taken from one
  if (kind === "poll" && !data.ref && !data.frameId) return { ok: false, error: "De quel film ou série tu parles ?" };
  const ref = kind === "poll" ? data.ref : kind === "top5" && data.items.length === 1 ? data.items[0] : null;
  const titleId = ref ? await titleIdFor(ref.kind, ref.tmdbId) : null;
  await db.insert(schema.posts).values({ userId: user.id, kind, body: body || null, data: data as PostData, titleId });
  refresh();
  return { ok: true };
}

export async function votePoll(postId: string, option: number) {
  const user = await requireUser();
  const [p] = await db.select({ kind: schema.posts.kind, data: schema.posts.data }).from(schema.posts).where(eq(schema.posts.id, postId));
  if (!p || p.kind !== "poll" || !p.data || !("options" in p.data) || option < 0 || option >= p.data.options.length) return;
  // One vote per member, final: no changing after seeing the results
  await db.insert(schema.pollVotes).values({ postId, userId: user.id, option }).onConflictDoNothing();
  refresh();
}

/** Pins one of the member's own top 5 on the profile, or unpins it. */
export async function pinPost(postId: string, on: boolean) {
  const user = await requireUser();
  const [p] = await db.select({ userId: schema.posts.userId, kind: schema.posts.kind }).from(schema.posts).where(eq(schema.posts.id, postId));
  if (!p || p.userId !== user.id || p.kind !== "top5") return;
  await db.update(schema.users).set({ pinnedPostId: on ? postId : null }).where(eq(schema.users.id, user.id));
  refresh();
}
