import { NextResponse } from "next/server";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { ownDevice } from "@/lib/chat";

/**
 * History for a newly approved device. A trusted device pages through the message keys it can
 * open (GET), opens them locally and wraps them again for the new device (POST).
 * The server only moves wrapped keys around.
 */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const q = new URL(req.url).searchParams;
  const me = await ownDevice(user.id, q.get("device"));
  if (!me) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const offset = Math.max(0, Number(q.get("offset")) || 0);
  const rows = await db
    .select({ messageId: schema.chatMessageKeys.messageId, wrap: schema.chatMessageKeys.wrap, fromId: schema.chatDevices.id, fromEcdh: schema.chatDevices.ecdh })
    .from(schema.chatMessageKeys)
    .innerJoin(schema.chatDevices, eq(schema.chatDevices.id, schema.chatMessageKeys.fromDevice))
    .where(eq(schema.chatMessageKeys.deviceId, me.id))
    .orderBy(asc(schema.chatMessageKeys.messageId))
    .limit(400)
    .offset(offset);
  return NextResponse.json({ items: rows.map((r) => ({ messageId: r.messageId, wrap: r.wrap, from: { id: r.fromId, ecdh: r.fromEcdh } })) });
}

const body = z.object({
  from: z.uuid(),
  device: z.uuid(),
  items: z.array(z.object({ messageId: z.uuid(), wrap: z.string().max(200) })).max(400),
});

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalide" }, { status: 400 });
  const { from, device, items } = parsed.data;
  const [a, b] = await Promise.all([ownDevice(user.id, from), ownDevice(user.id, device)]);
  if (!a || !b || !items.length) return NextResponse.json({ error: "Invalide" }, { status: 400 });
  // Only messages of this member's own conversations
  const allowed = await db
    .select({ id: schema.chatMessages.id })
    .from(schema.chatMessages)
    .innerJoin(schema.chatThreads, eq(schema.chatThreads.id, schema.chatMessages.threadId))
    .where(and(inArray(schema.chatMessages.id, items.map((i) => i.messageId)), sql`(${schema.chatThreads.a} = ${user.id} or ${schema.chatThreads.b} = ${user.id})`));
  const ok = new Set(allowed.map((m) => m.id));
  const rows = items.filter((i) => ok.has(i.messageId)).map((i) => ({ messageId: i.messageId, deviceId: b.id, fromDevice: a.id, wrap: i.wrap }));
  if (rows.length) await db.insert(schema.chatMessageKeys).values(rows).onConflictDoNothing();
  return NextResponse.json({ ok: rows.length });
}
