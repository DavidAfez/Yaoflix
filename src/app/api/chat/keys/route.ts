import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";

/** The member's own key material: public key and the private key wrapped with their secret code. */
export async function GET() {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const [k] = await db.select().from(schema.chatKeys).where(eq(schema.chatKeys.userId, user.id));
  return NextResponse.json({ userId: user.id, keys: k ? { publicKey: k.publicKey, wrappedKey: k.wrappedKey, salt: k.salt, iv: k.iv } : null });
}

const body = z.object({
  publicKey: z.string().max(1000),
  wrappedKey: z.string().max(4000),
  salt: z.string().max(64),
  iv: z.string().max(64),
  // A forgotten code: new keys, older messages become unreadable
  reset: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalide" }, { status: 400 });
  const { reset, ...k } = parsed.data;
  try {
    JSON.parse(k.publicKey);
  } catch {
    return NextResponse.json({ error: "Invalide" }, { status: 400 });
  }
  const [existing] = await db.select({ u: schema.chatKeys.userId }).from(schema.chatKeys).where(eq(schema.chatKeys.userId, user.id));
  if (existing && !reset) return NextResponse.json({ error: "Déjà configuré" }, { status: 409 });
  await db
    .insert(schema.chatKeys)
    .values({ userId: user.id, ...k })
    .onConflictDoUpdate({ target: schema.chatKeys.userId, set: { ...k, updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
