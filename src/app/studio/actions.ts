"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { hashPassword, requireRole } from "@/lib/auth";
import { blindIndex, encrypt, normalizeEmail } from "@/lib/crypto";
import { ageBrackets } from "@/lib/labels";
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

export type MemberState = { ok?: boolean; error?: string } | undefined;

const memberSchema = z.object({
  handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_.]{3,20}$/, "Pseudo : 3 à 20 caractères, lettres, chiffres, _ ou ."),
  age: z.enum(["", ...ageBrackets]),
  sex: z.enum(["F", "M", "X", ""]),
});

/** Staff-created account: already verified, the member changes the password later if needed. */
export async function createMember(_: MemberState, form: FormData): Promise<MemberState> {
  const actor = await requireRole(can.manageUsers);
  const parsed = memberSchema
    .extend({
      email: z.email("Email invalide").max(254),
      password: z.string().min(10, "Mot de passe : 10 caractères minimum").max(200),
      role: z.enum(roleEnum.enumValues),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { handle, email, password, role, age, sex } = parsed.data;
  if (role !== "USER" && !can.setRole(actor.role, "USER", role)) return { error: "Rôle interdit" };
  const emailHash = blindIndex(normalizeEmail(email), "email");
  const [taken] = await db
    .select({ handle: schema.users.handle, emailHash: schema.users.emailHash })
    .from(schema.users)
    .where(or(eq(schema.users.handle, handle), eq(schema.users.emailHash, emailHash)));
  if (taken) return { error: taken.handle === handle ? "Pseudo déjà pris" : "Email déjà utilisé" };
  const [u] = await db
    .insert(schema.users)
    .values({
      handle,
      emailEnc: encrypt(normalizeEmail(email)),
      emailHash,
      emailVerifiedAt: new Date(),
      approvedAt: new Date(),
      passwordHash: await hashPassword(password),
      role,
      ageBracket: age || null,
      sex: sex || null,
    })
    .returning({ id: schema.users.id });
  await audit(actor.id, "user.create", u.id, { role });
  revalidatePath("/studio/members");
  return { ok: true };
}

export async function updateMember(_: MemberState, form: FormData): Promise<MemberState> {
  const actor = await requireRole(can.manageUsers);
  const id = String(form.get("id") ?? "");
  const parsed = memberSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const [target] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, id));
  if (!target || (id !== actor.id && !can.moderate(actor.role, target.role))) return { error: "Interdit" };
  const { handle, age, sex } = parsed.data;
  const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.handle, handle), ne(schema.users.id, id)));
  if (taken) return { error: "Pseudo déjà pris" };
  await db.update(schema.users).set({ handle, ageBracket: age || null, sex: sex || null }).where(eq(schema.users.id, id));
  await audit(actor.id, "user.update", id);
  revalidatePath("/studio/members");
  return { ok: true };
}

export async function setDeepReview(userId: string, on: boolean) {
  const actor = await requireRole(can.manageUsers);
  await db.update(schema.users).set({ deepReview: on }).where(eq(schema.users.id, userId));
  await audit(actor.id, on ? "user.deep.on" : "user.deep.off", userId);
  revalidatePath("/studio/members");
}

/** Deletes the account and everything tied to it. Reviews stay, anonymous (their user becomes null). */
export async function deleteMember(userId: string) {
  const actor = await requireRole(can.manageUsers);
  const [target] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, userId));
  if (!target || userId === actor.id || !can.moderate(actor.role, target.role)) throw new Error("Forbidden");
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await audit(actor.id, "user.delete", userId);
  revalidatePath("/studio/members");
}

/** Lets in a member who confirmed the email. */
export async function approveMember(userId: string) {
  const actor = await requireRole(can.manageUsers);
  const [u] = await db
    .update(schema.users)
    .set({ approvedAt: new Date() })
    .where(and(eq(schema.users.id, userId), isNull(schema.users.approvedAt)))
    .returning({ id: schema.users.id });
  if (u) {
    await queueMail(u.id, "approved", {});
    await audit(actor.id, "user.approve", userId);
  }
  revalidatePath("/studio/members");
}
