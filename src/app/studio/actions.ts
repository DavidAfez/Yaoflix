"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { queueMail } from "@/lib/jobs";
import { enqueue } from "@/lib/jobs";
import { rejectReasonEnum, roleEnum } from "@/db/schema";

const OPEN = ["PENDING", "IN_PROGRESS"] as const;

async function audit(actorId: string, action: string, target: string, meta: Record<string, unknown> = {}) {
  await db.insert(schema.auditLog).values({ actorId, action, target, meta });
}

export async function claimTitle(titleId: number) {
  const user = await requireRole(can.handleRequests);
  await db
    .update(schema.requests)
    .set({ status: "IN_PROGRESS", handledBy: user.id })
    .where(and(eq(schema.requests.titleId, titleId), eq(schema.requests.status, "PENDING")));
  revalidatePath("/studio");
}

export async function refuseTitle(titleId: number, reason: string) {
  const user = await requireRole(can.handleRequests);
  const r = z.enum(rejectReasonEnum.enumValues).parse(reason);
  const rows = await db
    .update(schema.requests)
    .set({ status: "REJECTED", rejectReason: r, handledBy: user.id, handledAt: new Date() })
    .where(and(eq(schema.requests.titleId, titleId), inArray(schema.requests.status, [...OPEN])))
    .returning({ userId: schema.requests.userId });
  const [t] = await db.select({ name: schema.titles.name }).from(schema.titles).where(eq(schema.titles.id, titleId));
  for (const uid of new Set(rows.map((x) => x.userId).filter(Boolean) as string[])) {
    await queueMail(uid, "rejected", { title: t?.name, reason: r });
  }
  await audit(user.id, "request.refuse", String(titleId), { reason: r, count: rows.length });
  revalidatePath("/studio");
}

export async function retryMedia(mediaId: string) {
  const user = await requireRole(can.upload);
  await db.update(schema.media).set({ status: "QUEUED", error: null, progress: 0 }).where(eq(schema.media.id, mediaId));
  await enqueue("transcode", { mediaId });
  await audit(user.id, "media.retry", mediaId);
  revalidatePath("/studio/library");
}

export async function deleteMedia(mediaId: string) {
  const user = await requireRole(can.manageUsers);
  const { rm } = await import("node:fs/promises");
  const { paths } = await import("@/lib/storage");
  await db.delete(schema.media).where(eq(schema.media.id, mediaId));
  await rm(paths.hlsDir(mediaId), { recursive: true, force: true });
  await rm(paths.source(mediaId), { force: true });
  await audit(user.id, "media.delete", mediaId);
  revalidatePath("/studio/library");
}

export async function setRole(userId: string, role: string) {
  const actor = await requireRole(can.manageUsers);
  const next = z.enum(roleEnum.enumValues).parse(role);
  const [target] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, userId));
  if (!target || userId === actor.id || !can.setRole(actor.role, target.role, next)) throw new Error("Forbidden");
  await db.update(schema.users).set({ role: next }).where(eq(schema.users.id, userId));
  await audit(actor.id, "user.role", userId, { from: target.role, to: next });
  revalidatePath("/studio/members");
}

export async function setBan(userId: string, banned: boolean) {
  const actor = await requireRole(can.manageUsers);
  const [target] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, userId));
  if (!target || userId === actor.id || !can.moderate(actor.role, target.role)) throw new Error("Forbidden");
  await db.update(schema.users).set({ bannedAt: banned ? new Date() : null }).where(eq(schema.users.id, userId));
  if (banned) {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    await db.update(schema.accessGrants).set({ revokedAt: new Date() }).where(eq(schema.accessGrants.userId, userId));
  }
  await audit(actor.id, banned ? "user.ban" : "user.unban", userId);
  revalidatePath("/studio/members");
}

export async function resolveError(id: number) {
  const user = await requireRole(can.resolveErrors);
  await db.update(schema.errorLogs).set({ resolvedAt: new Date(), resolvedBy: user.id }).where(eq(schema.errorLogs.id, id));
  revalidatePath("/studio/errors");
}

export async function purgeResolved() {
  const user = await requireRole(can.purgeErrors);
  const { isNotNull } = await import("drizzle-orm");
  await db.delete(schema.errorLogs).where(isNotNull(schema.errorLogs.resolvedAt));
  await audit(user.id, "errors.purge", "*");
  revalidatePath("/studio/errors");
}
