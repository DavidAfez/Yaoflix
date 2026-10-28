import { NextResponse } from "next/server";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { devicesOf } from "@/lib/chat";
import { statement, verifySig } from "@/lib/e2e";
import { rateLimit } from "@/lib/ratelimit";

/** The member's own devices, approved or waiting for approval. */
export async function GET() {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  return NextResponse.json({ userId: user.id, devices: await devicesOf(user.id) });
}

const key = z.string().regex(/^[A-Za-z0-9+/=]+$/).max(200);
const body = z.object({
  id: z.uuid(),
  ecdh: key,
  sign: key,
  sig: key,
  label: z.string().max(60),
  // Lost every other device: this one becomes the new root, the old ones stop receiving
  reset: z.boolean().optional(),
});

/**
 * Registers this device. The first one is approved at once (root); the next ones wait until
 * a trusted device vouches for them.
 */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  if (!rateLimit(`device:${user.id}`, 10, 3600)) return NextResponse.json({ error: "Doucement, réessaie dans une minute." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalide" }, { status: 400 });
  const d = parsed.data;
  if (!(await verifySig(d.sign, statement({ ...d, userId: user.id }), d.sig))) return NextResponse.json({ error: "Invalide" }, { status: 400 });

  const [approved] = await db
    .select({ id: schema.chatDevices.id })
    .from(schema.chatDevices)
    .where(and(eq(schema.chatDevices.userId, user.id), isNull(schema.chatDevices.revokedAt), isNotNull(schema.chatDevices.approvedAt)));
  const root = !approved || d.reset;
  await db.transaction(async (tx) => {
    if (d.reset) await tx.update(schema.chatDevices).set({ revokedAt: new Date() }).where(and(eq(schema.chatDevices.userId, user.id), isNull(schema.chatDevices.revokedAt)));
    // A device that asked before and asks again replaces its previous request
    else await tx.update(schema.chatDevices).set({ revokedAt: new Date() }).where(and(eq(schema.chatDevices.userId, user.id), isNull(schema.chatDevices.revokedAt), isNull(schema.chatDevices.approvedAt), eq(schema.chatDevices.label, d.label)));
    await tx.insert(schema.chatDevices).values({ id: d.id, userId: user.id, ecdh: d.ecdh, sign: d.sign, sig: d.sig, label: d.label, signedBy: null, approvedAt: root ? new Date() : null });
  });
  return NextResponse.json({ approved: root });
}
