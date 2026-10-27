import { NextResponse } from "next/server";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { enqueue } from "@/lib/jobs";
import { rateLimit } from "@/lib/ratelimit";

const body = z.object({
  grantId: z.uuid(),
  kind: z.enum(["video", "image"]),
  start: z.number().min(0),
  end: z.number().min(0).optional(),
  text: z.string().trim().max(1000).optional(),
  post: z.boolean().optional(),
});

/** Cut a clip (or grab a frame) from a film the member is allowed to watch right now. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  if (!rateLimit(`clip:${user.id}`, 6, 60)) return NextResponse.json({ error: "Doucement, réessaie dans une minute." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalide" }, { status: 400 });
  const { grantId, kind, start, end, text, post } = parsed.data;
  if (kind === "image" && !can.capture(user.role)) return NextResponse.json({ error: "Interdit" }, { status: 403 });

  const [g] = await db
    .select({ mediaId: schema.media.id, titleId: schema.media.titleId, duration: schema.media.durationSec })
    .from(schema.accessGrants)
    .innerJoin(schema.media, eq(schema.media.id, schema.accessGrants.mediaId))
    .where(
      and(
        eq(schema.accessGrants.id, grantId),
        eq(schema.accessGrants.userId, user.id),
        gt(schema.accessGrants.expiresAt, new Date()),
        isNull(schema.accessGrants.revokedAt),
        eq(schema.media.status, "READY"),
      ),
    );
  if (!g) return NextResponse.json({ error: "Interdit" }, { status: 403 });

  const dur = kind === "video" ? Math.min(15, Math.max(1, (end ?? start + 10) - start)) : 0;
  if (g.duration && start > g.duration) return NextResponse.json({ error: "Invalide" }, { status: 400 });

  const [c] = await db
    .insert(schema.clips)
    .values({ userId: user.id, mediaId: g.mediaId, titleId: g.titleId, kind, startSec: start, durationSec: dur })
    .returning({ id: schema.clips.id });
  await enqueue("clip", { clipId: c.id });
  if (post && kind === "video") {
    await db.insert(schema.posts).values({ userId: user.id, titleId: g.titleId, kind: "clip", clipId: c.id, body: text || null });
  }
  return NextResponse.json({ id: c.id });
}

/** The member's own still frames, newest first, for the tier list and poll builders. */
export async function GET() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const rows = await db
    .select({ id: schema.clips.id, start: schema.clips.startSec, name: schema.titles.name, status: schema.clips.status })
    .from(schema.clips)
    .innerJoin(schema.titles, eq(schema.titles.id, schema.clips.titleId))
    .where(and(eq(schema.clips.userId, user.id), eq(schema.clips.kind, "image")))
    .orderBy(desc(schema.clips.createdAt))
    .limit(60);
  return NextResponse.json({ frames: rows });
}
