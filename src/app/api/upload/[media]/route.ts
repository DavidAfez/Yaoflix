import { NextResponse } from "next/server";
import { open } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { paths } from "@/lib/storage";

const MAX_CHUNK = 16 * 1024 * 1024;

/** Appends one chunk. The client sends its offset; a mismatch returns the server offset so it can resume. */
export async function PUT(req: Request, ctx: RouteContext<"/api/upload/[media]">) {
  const user = await apiUser(can.upload);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { media: id } = await ctx.params;
  const offset = Number(new URL(req.url).searchParams.get("offset"));

  const [m] = await db
    .select()
    .from(schema.media)
    .where(and(eq(schema.media.id, id), eq(schema.media.status, "UPLOADING")));
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (offset !== m.uploadedBytes) return NextResponse.json({ offset: m.uploadedBytes }, { status: 409 });

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > MAX_CHUNK || offset + buf.length > (m.sourceSize ?? 0)) {
    return NextResponse.json({ error: "chunk" }, { status: 400 });
  }
  const fh = await open(paths.source(id), offset === 0 ? "w" : "r+");
  try {
    await fh.write(buf, 0, buf.length, offset);
  } finally {
    await fh.close();
  }
  const next = offset + buf.length;
  await db.update(schema.media).set({ uploadedBytes: next }).where(eq(schema.media.id, id));
  return NextResponse.json({ offset: next });
}
