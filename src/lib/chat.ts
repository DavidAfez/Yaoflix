import "server-only";
import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@/db";

/** The thread if this member is one of its two participants. */
export async function threadFor(userId: string, threadId: string) {
  if (!/^[0-9a-f-]{36}$/.test(threadId)) return null;
  const [t] = await db
    .select()
    .from(schema.chatThreads)
    .where(and(eq(schema.chatThreads.id, threadId), or(eq(schema.chatThreads.a, userId), eq(schema.chatThreads.b, userId))));
  return t ?? null;
}

export async function blockedBetween(a: string, b: string) {
  const [x] = await db
    .select({ x: schema.blocks.blockerId })
    .from(schema.blocks)
    .where(or(and(eq(schema.blocks.blockerId, a), eq(schema.blocks.blockedId, b)), and(eq(schema.blocks.blockerId, b), eq(schema.blocks.blockedId, a))));
  return Boolean(x);
}
