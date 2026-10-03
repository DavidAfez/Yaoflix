import { NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { paths } from "@/lib/storage";
import { enqueue } from "@/lib/jobs";

export async function POST(_: Request, ctx: RouteContext<"/api/upload/[media]/complete">) {
  const user = await apiUser(can.upload);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { media: id } = await ctx.params;
  const [m] = await db
    .select()
    .from(schema.media)
    .where(and(eq(schema.media.id, id), eq(schema.media.status, "UPLOADING")));
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  const size = (await stat(paths.source(id)).catch(() => null))?.size;
  if (size !== m.sourceSize || m.uploadedBytes !== m.sourceSize) return NextResponse.json({ error: "incomplete" }, { status: 409 });

  await db.update(schema.media).set({ status: "QUEUED" }).where(eq(schema.media.id, id));
  await enqueue("transcode", { mediaId: id });
  await db.insert(schema.auditLog).values({ actorId: user.id, action: "media.upload", target: id, meta: { titleId: m.titleId, size } });
  return NextResponse.json({ ok: true });
}
