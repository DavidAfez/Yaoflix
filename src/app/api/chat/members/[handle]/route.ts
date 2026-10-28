import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { devicesOf } from "@/lib/chat";

/** Someone's approved devices (public keys and signatures), to write to them. */
export async function GET(_: Request, ctx: RouteContext<"/api/chat/members/[handle]">) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const handle = decodeURIComponent((await ctx.params).handle).replace(/^@/, "").toLowerCase();
  const [u] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.handle, handle), isNull(schema.users.bannedAt)));
  if (!u) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json({ userId: u.id, devices: (await devicesOf(u.id)).filter((d) => d.approved) });
}
