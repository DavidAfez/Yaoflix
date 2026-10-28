import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { castToken } from "@/lib/cast";

/** Signed playlist URL for a TV or for Safari's native player (AirPlay). */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const { grantId } = ((await req.json().catch(() => ({}))) ?? {}) as { grantId?: string };
  if (!grantId || !/^[0-9a-f-]{36}$/.test(grantId)) return NextResponse.json({}, { status: 400 });
  const [g] = await db
    .select({ id: schema.accessGrants.id })
    .from(schema.accessGrants)
    .where(and(eq(schema.accessGrants.id, grantId), eq(schema.accessGrants.userId, user.id), gt(schema.accessGrants.expiresAt, new Date()), isNull(schema.accessGrants.revokedAt)));
  if (!g) return NextResponse.json({}, { status: 403 });
  // The TV must reach the site: the public address (APP_URL) is preferred over the one the browser used
  const origin = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
  return NextResponse.json({ url: `${origin}/api/cast/${castToken(grantId)}/master.m3u8` });
}
