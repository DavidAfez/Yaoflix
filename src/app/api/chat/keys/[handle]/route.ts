import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";

/** Someone's public key, to talk to them. */
export async function GET(_: Request, ctx: RouteContext<"/api/chat/keys/[handle]">) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const { handle } = await ctx.params;
  const [k] = await db
    .select({ userId: schema.users.id, publicKey: schema.chatKeys.publicKey })
    .from(schema.users)
    .innerJoin(schema.chatKeys, eq(schema.chatKeys.userId, schema.users.id))
    .where(and(eq(schema.users.handle, decodeURIComponent(handle).toLowerCase()), isNull(schema.users.bannedAt)));
  if (!k) return NextResponse.json({ error: "Pas encore de messagerie" }, { status: 404 });
  return NextResponse.json(k);
}
