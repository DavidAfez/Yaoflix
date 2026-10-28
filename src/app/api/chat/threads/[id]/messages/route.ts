import { NextResponse } from "next/server";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { blockedBetween, ownDevice, threadFor } from "@/lib/chat";
import { rateLimit } from "@/lib/ratelimit";

const from = alias(schema.chatDevices, "from_device");

/**
 * Ciphertexts of a thread, each with its key wrapped for the asking device (?device=).
 * ?after=<iso> returns only the newer ones (polling). Reading marks the thread read.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/chat/threads/[id]/messages">) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const t = await threadFor(user.id, (await ctx.params).id);
  if (!t) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const device = await ownDevice(user.id, q.get("device"));
  if (!device) return NextResponse.json({ error: "Appareil inconnu" }, { status: 403 });
  const after = q.get("after");
  const cols = {
    id: schema.chatMessages.id,
    senderId: schema.chatMessages.senderId,
    iv: schema.chatMessages.iv,
    body: schema.chatMessages.body,
    at: schema.chatMessages.createdAt,
    wrap: schema.chatMessageKeys.wrap,
    fromId: from.id,
    fromEcdh: from.ecdh,
  };
  const base = db
    .select(cols)
    .from(schema.chatMessages)
    .leftJoin(schema.chatMessageKeys, and(eq(schema.chatMessageKeys.messageId, schema.chatMessages.id), eq(schema.chatMessageKeys.deviceId, device.id)))
    .leftJoin(from, eq(from.id, schema.chatMessageKeys.fromDevice));
  const rows = after
    ? await base.where(and(eq(schema.chatMessages.threadId, t.id), gt(schema.chatMessages.createdAt, new Date(after)))).orderBy(asc(schema.chatMessages.createdAt)).limit(200)
    : (await base.where(eq(schema.chatMessages.threadId, t.id)).orderBy(desc(schema.chatMessages.createdAt)).limit(150)).reverse();
  await db
    .insert(schema.chatReads)
    .values({ threadId: t.id, userId: user.id })
    .onConflictDoUpdate({ target: [schema.chatReads.threadId, schema.chatReads.userId], set: { at: new Date() } });
  return NextResponse.json({
    messages: rows.map((m) => ({
      id: m.id,
      mine: m.senderId === user.id,
      iv: m.iv,
      body: m.body,
      at: m.at.toISOString(),
      key: m.wrap && m.fromId && m.fromEcdh ? { wrap: m.wrap, from: { id: m.fromId, ecdh: m.fromEcdh } } : null,
    })),
  });
}

const body = z.object({
  device: z.uuid(),
  iv: z.string().max(32),
  body: z.string().min(1).max(64_000),
  keys: z.array(z.object({ device: z.uuid(), wrap: z.string().max(200) })).min(1).max(40),
});

export async function POST(req: Request, ctx: RouteContext<"/api/chat/threads/[id]/messages">) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  if (!rateLimit(`msg:${user.id}`, 30, 30)) return NextResponse.json({ error: "Doucement, réessaie dans une minute." }, { status: 429 });
  const t = await threadFor(user.id, (await ctx.params).id);
  if (!t) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (await blockedBetween(t.a, t.b)) return NextResponse.json({ error: "Impossible d'écrire à ce membre" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalide" }, { status: 400 });
  const { device, iv, body: text, keys } = parsed.data;
  const sender = await ownDevice(user.id, device);
  if (!sender) return NextResponse.json({ error: "Appareil inconnu" }, { status: 403 });
  // Keys may only go to the two members' current devices
  const ids = keys.map((k) => k.device);
  const ok = new Set(
    (
      await db
        .select({ id: schema.chatDevices.id })
        .from(schema.chatDevices)
        .where(and(inArray(schema.chatDevices.id, ids), inArray(schema.chatDevices.userId, [t.a, t.b]), isNull(schema.chatDevices.revokedAt), isNotNull(schema.chatDevices.approvedAt)))
    ).map((d) => d.id),
  );
  if (!ok.has(sender.id)) return NextResponse.json({ error: "Invalide" }, { status: 400 });
  const m = await db.transaction(async (tx) => {
    const [m] = await tx.insert(schema.chatMessages).values({ threadId: t.id, senderId: user.id, senderDevice: sender.id, iv, body: text }).returning();
    await tx.insert(schema.chatMessageKeys).values(keys.filter((k) => ok.has(k.device)).map((k) => ({ messageId: m.id, deviceId: k.device, fromDevice: sender.id, wrap: k.wrap })));
    await tx.update(schema.chatThreads).set({ lastAt: new Date() }).where(eq(schema.chatThreads.id, t.id));
    return m;
  });
  return NextResponse.json({ id: m.id, mine: true, iv: m.iv, body: m.body, at: m.createdAt.toISOString(), key: null });
}
