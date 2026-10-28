import "server-only";
import { and, asc, eq, isNotNull, isNull, or } from "drizzle-orm";
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

type DeviceRow = typeof schema.chatDevices.$inferSelect;
export const toDevice = (d: DeviceRow) => ({
  id: d.id,
  userId: d.userId,
  ecdh: d.ecdh,
  sign: d.sign,
  signedBy: d.signedBy,
  sig: d.sig,
  label: d.label,
  approved: Boolean(d.approvedAt),
  createdAt: d.createdAt.toISOString(),
});

/** A member's devices still in use, approved or waiting. */
export async function devicesOf(userId: string) {
  const rows = await db
    .select()
    .from(schema.chatDevices)
    .where(and(eq(schema.chatDevices.userId, userId), isNull(schema.chatDevices.revokedAt)))
    .orderBy(asc(schema.chatDevices.createdAt));
  return rows.map(toDevice);
}

/** One of this member's approved devices, or null. */
export async function ownDevice(userId: string, id: string | null) {
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [d] = await db
    .select()
    .from(schema.chatDevices)
    .where(and(eq(schema.chatDevices.id, id), eq(schema.chatDevices.userId, userId), isNull(schema.chatDevices.revokedAt), isNotNull(schema.chatDevices.approvedAt)));
  return d ?? null;
}
