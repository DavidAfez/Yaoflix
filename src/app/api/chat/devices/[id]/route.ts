import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { ownDevice } from "@/lib/chat";
import { statement, verifySig } from "@/lib/e2e";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), signedBy: z.uuid(), sig: z.string().max(200) }),
  z.object({ action: z.literal("revoke") }),
]);

/** Approve a waiting device (signed by a trusted one) or remove a device. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/chat/devices/[id]">) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalide" }, { status: 400 });
  const [d] = await db
    .select()
    .from(schema.chatDevices)
    .where(and(eq(schema.chatDevices.id, id), eq(schema.chatDevices.userId, user.id), isNull(schema.chatDevices.revokedAt)));
  if (!d) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  if (parsed.data.action === "revoke") {
    await db.update(schema.chatDevices).set({ revokedAt: new Date() }).where(eq(schema.chatDevices.id, d.id));
    return NextResponse.json({ ok: true });
  }
  const signer = await ownDevice(user.id, parsed.data.signedBy);
  if (!signer || d.approvedAt) return NextResponse.json({ error: "Invalide" }, { status: 400 });
  if (!(await verifySig(signer.sign, statement(d), parsed.data.sig))) return NextResponse.json({ error: "Invalide" }, { status: 400 });
  await db.update(schema.chatDevices).set({ signedBy: signer.id, sig: parsed.data.sig, approvedAt: new Date() }).where(eq(schema.chatDevices.id, d.id));
  return NextResponse.json({ ok: true });
}
