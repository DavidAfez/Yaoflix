import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { resolveGrant } from "@/lib/access";
import { countryFrom, deviceFrom } from "@/lib/context";
import { enqueue } from "@/lib/jobs";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), grant: z.string().max(64) }),
  z.object({ action: z.literal("beat"), ws: z.uuid(), pos: z.number().min(0), played: z.number().min(0) }),
  z.object({ action: z.literal("span"), ws: z.uuid(), seconds: z.number().min(0), endedBy: z.enum(["pause", "end", "leave"]), pos: z.number().min(0).optional() }),
  z.object({ action: z.literal("end"), ws: z.uuid() }),
]);

/** Playback telemetry. Feeds the focus metric (time between pauses) and resume position. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  let parsed;
  try {
    parsed = body.parse(JSON.parse(await req.text()));
  } catch {
    return NextResponse.json({ error: "bad" }, { status: 400 });
  }

  if (parsed.action === "start") {
    const g = await resolveGrant(parsed.grant, user.id);
    if (!g) return NextResponse.json({ error: "grant" }, { status: 403 });
    const h = await headers();
    const [ws] = await db
      .insert(schema.watchSessions)
      .values({
        userId: user.id,
        mediaId: g.media.id,
        titleId: g.title.id,
        country: countryFrom(h),
        device: deviceFrom(h),
        ageBracket: user.ageBracket,
        sex: user.sex,
      })
      .returning({ id: schema.watchSessions.id });
    return NextResponse.json({ ws: ws.id });
  }

  const own = and(eq(schema.watchSessions.id, parsed.ws), eq(schema.watchSessions.userId, user.id));
  const [ws] = await db
    .select({ id: schema.watchSessions.id, mediaId: schema.watchSessions.mediaId, titleId: schema.watchSessions.titleId, completed: schema.watchSessions.completed })
    .from(schema.watchSessions)
    .where(own);
  if (!ws) return NextResponse.json({ error: "ws" }, { status: 404 });

  const savePos = async (pos: number) =>
    db
      .update(schema.accessGrants)
      .set({ lastPositionSec: Math.round(pos) })
      .where(and(eq(schema.accessGrants.userId, user.id), eq(schema.accessGrants.mediaId, ws.mediaId)));

  switch (parsed.action) {
    case "beat":
      await db
        .update(schema.watchSessions)
        .set({ lastSeenAt: new Date(), watchedSec: sql`${schema.watchSessions.watchedSec} + ${Math.min(60, Math.round(parsed.played))}` })
        .where(own);
      await savePos(parsed.pos);
      break;
    case "span":
      if (parsed.seconds >= 2) {
        await db.insert(schema.focusSpans).values({ watchSessionId: ws.id, seconds: Math.round(parsed.seconds), endedBy: parsed.endedBy });
      }
      if (parsed.endedBy === "pause") {
        await db.update(schema.watchSessions).set({ pauses: sql`${schema.watchSessions.pauses} + 1` }).where(own);
      }
      if (parsed.pos != null) await savePos(parsed.pos);
      break;
    case "end":
      if (!ws.completed) {
        await db.update(schema.watchSessions).set({ completed: true, lastSeenAt: new Date() }).where(own);
        await savePos(0);
        const [t] = await db.select({ name: schema.titles.name }).from(schema.titles).where(eq(schema.titles.id, ws.titleId));
        // A WhatsApp nudge a bit later, for people who skipped the in-app voice note
        if (user.whatsappOptIn) await enqueue("whatsapp", { userId: user.id, template: "feedback", data: { title: t?.name } }, 10 * 60);
      }
      break;
  }
  return NextResponse.json({ ok: true });
}
