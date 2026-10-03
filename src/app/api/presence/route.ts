import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { countryFrom, deviceFrom } from "@/lib/context";

const IDLE_MIN = 30;

/** Heartbeat: extends the current platform session or opens a new one after 30 min of silence. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  let body: { sid?: string | null; sec?: number } = {};
  try {
    body = JSON.parse(await req.text());
  } catch {}
  const sec = Math.max(0, Math.min(60, Math.round(Number(body.sec) || 0)));

  if (body.sid && /^[0-9a-f-]{36}$/.test(body.sid)) {
    const [row] = await db
      .update(schema.platformSessions)
      .set({ lastSeenAt: new Date(), activeSec: sql`${schema.platformSessions.activeSec} + ${sec}` })
      .where(
        and(
          eq(schema.platformSessions.id, body.sid),
          eq(schema.platformSessions.userId, user.id),
          gt(schema.platformSessions.lastSeenAt, sql`now() - make_interval(mins => ${IDLE_MIN})`),
        ),
      )
      .returning({ id: schema.platformSessions.id });
    if (row) return NextResponse.json({ sid: row.id });
  }

  const h = await headers();
  const country = countryFrom(h);
  const [row] = await db
    .insert(schema.platformSessions)
    .values({ userId: user.id, country, device: deviceFrom(h), ageBracket: user.ageBracket, sex: user.sex })
    .returning({ id: schema.platformSessions.id });
  await db.update(schema.users).set({ lastSeenAt: new Date(), ...(country ? { country } : {}) }).where(eq(schema.users.id, user.id));
  return NextResponse.json({ sid: row.id });
}
