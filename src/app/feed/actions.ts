"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { rateLimit } from "@/lib/ratelimit";
import { titleIdFor } from "@/lib/marks";

const refresh = () => revalidatePath("/", "layout");

const postSchema = z.object({
  body: z.string().trim().min(1, "Écris quelque chose").max(1000, "1000 caractères maximum"),
  kind: z.enum(["movie", "tv"]).optional(),
  tmdbId: z.number().int().positive().optional(),
  parentId: z.uuid().optional(),
});

/** A new post, or a reply when parentId is set. */
export async function createPost(input: z.input<typeof postSchema>): Promise<{ ok: boolean; error?: string; id?: string }> {
  const user = await requireUser();
  if (!rateLimit(`post:${user.id}`, 10, 60)) return { ok: false, error: "Doucement, réessaie dans une minute." };
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const { body, kind, tmdbId, parentId } = parsed.data;
  let titleId: number | null = null;
  if (parentId) {
    // A reply talks about the same title as the post it answers
    const [parent] = await db.select({ titleId: schema.posts.titleId }).from(schema.posts).where(eq(schema.posts.id, parentId));
    if (!parent) return { ok: false, error: "Post introuvable" };
    titleId = parent.titleId;
  } else if (kind && tmdbId) titleId = await titleIdFor(kind, tmdbId);
  const [p] = await db.insert(schema.posts).values({ userId: user.id, body, titleId, parentId: parentId ?? null }).returning({ id: schema.posts.id });
  refresh();
  return { ok: true, id: p.id };
}

export async function toggleFav(postId: string, on: boolean) {
  const user = await requireUser();
  const where = and(eq(schema.postLikes.userId, user.id), eq(schema.postLikes.postId, postId));
  if (on) await db.insert(schema.postLikes).values({ userId: user.id, postId }).onConflictDoNothing();
  else await db.delete(schema.postLikes).where(where);
  refresh();
}

/** A repost is an empty post pointing to the original. */
export async function toggleRepost(postId: string, on: boolean) {
  const user = await requireUser();
  const where = and(eq(schema.posts.userId, user.id), eq(schema.posts.repostOf, postId));
  if (on) {
    const [already] = await db.select({ id: schema.posts.id }).from(schema.posts).where(where);
    if (!already) await db.insert(schema.posts).values({ userId: user.id, repostOf: postId });
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
  if (on) await db.insert(schema.follows).values({ followerId: user.id, followeeId: target.id }).onConflictDoNothing();
  else await db.delete(schema.follows).where(and(eq(schema.follows.followerId, user.id), eq(schema.follows.followeeId, target.id)));
  refresh();
}
