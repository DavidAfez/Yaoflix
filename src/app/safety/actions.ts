"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { REASONS } from "@/lib/safety";

/** Blocking hides each other's posts, stops follows and messages. */
export async function blockUser(handle: string, on: boolean) {
  const user = await requireUser();
  const [target] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.handle, handle));
  if (!target || target.id === user.id) return;
  if (on) {
    await db.insert(schema.blocks).values({ blockerId: user.id, blockedId: target.id }).onConflictDoNothing();
    // A block also cuts the follow links both ways
    await db.delete(schema.follows).where(and(eq(schema.follows.followerId, user.id), eq(schema.follows.followeeId, target.id)));
    await db.delete(schema.follows).where(and(eq(schema.follows.followerId, target.id), eq(schema.follows.followeeId, user.id)));
  } else {
    await db.delete(schema.blocks).where(and(eq(schema.blocks.blockerId, user.id), eq(schema.blocks.blockedId, target.id)));
  }
  revalidatePath("/", "layout");
}


const reportSchema = z.object({
  type: z.enum(["post", "user", "message"]),
  id: z.string().min(1).max(64),
  reason: z.enum(REASONS),
  note: z.string().trim().max(500).optional(),
  // Messages are end-to-end encrypted: the reporter chooses to share the decrypted text
  text: z.string().max(4000).optional(),
});

export async function report(input: z.input<typeof reportSchema>) {
  const user = await requireUser();
  if (!rateLimit(`report:${user.id}`, 10, 600)) return { ok: false, error: "Trop de signalements, réessaie plus tard." };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalide" };
  const { type, id, reason, note, text } = parsed.data;
  let targetUserId: string | null = null;
  let snapshot: { text?: string; handle?: string; kind?: string } = {};
  if (type === "post") {
    const [p] = await db
      .select({ userId: schema.posts.userId, body: schema.posts.body, kind: schema.posts.kind, handle: schema.users.handle })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.users.id, schema.posts.userId))
      .where(eq(schema.posts.id, id));
    if (!p) return { ok: false, error: "Introuvable" };
    targetUserId = p.userId;
    snapshot = { text: p.body ?? undefined, handle: p.handle, kind: p.kind };
  } else if (type === "user") {
    const [u] = await db.select({ id: schema.users.id, handle: schema.users.handle, bio: schema.users.bio }).from(schema.users).where(eq(schema.users.id, id));
    if (!u) return { ok: false, error: "Introuvable" };
    targetUserId = u.id;
    snapshot = { handle: u.handle, text: u.bio ?? undefined };
  } else {
    const [m] = await db
      .select({ senderId: schema.chatMessages.senderId, a: schema.chatThreads.a, b: schema.chatThreads.b, handle: schema.users.handle })
      .from(schema.chatMessages)
      .innerJoin(schema.chatThreads, eq(schema.chatThreads.id, schema.chatMessages.threadId))
      .innerJoin(schema.users, eq(schema.users.id, schema.chatMessages.senderId))
      .where(eq(schema.chatMessages.id, id));
    // Only someone in the conversation can report one of its messages
    if (!m || (m.a !== user.id && m.b !== user.id)) return { ok: false, error: "Introuvable" };
    targetUserId = m.senderId;
    snapshot = { text, handle: m.handle };
  }
  if (targetUserId === user.id) return { ok: false, error: "Invalide" };
  await db.insert(schema.reports).values({ reporterId: user.id, targetType: type, targetId: id, targetUserId, reason, note: note || null, snapshot });
  return { ok: true };
}
