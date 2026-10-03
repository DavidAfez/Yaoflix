import { NextResponse } from "next/server";
import { mkdir } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { paths } from "@/lib/storage";

const CHUNK = 8 * 1024 * 1024;
const MAX = 80 * 1024 ** 3;

const body = z.object({ titleId: z.number().int().positive(), name: z.string().max(300), size: z.number().int().positive().max(MAX) });

/** Starts or resumes a chunked upload. Same title + file name + size by the same person resumes where it stopped. */
export async function POST(req: Request) {
  const user = await apiUser(can.upload);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad" }, { status: 400 });
  const { titleId, name, size } = parsed.data;

  const [existing] = await db
    .select()
    .from(schema.media)
    .where(
      and(
        eq(schema.media.titleId, titleId),
        eq(schema.media.status, "UPLOADING"),
        eq(schema.media.sourceName, name),
        eq(schema.media.sourceSize, size),
        eq(schema.media.uploadedBy, user.id),
      ),
    )
    .limit(1);
  await mkdir(paths.sourceDir, { recursive: true });
  if (existing) return NextResponse.json({ mediaId: existing.id, offset: existing.uploadedBytes, chunk: CHUNK });

  const [m] = await db
    .insert(schema.media)
    .values({ titleId, sourceName: name, sourceSize: size, uploadedBy: user.id })
    .returning({ id: schema.media.id });
  await db
    .update(schema.requests)
    .set({ status: "IN_PROGRESS", handledBy: user.id })
    .where(and(eq(schema.requests.titleId, titleId), eq(schema.requests.status, "PENDING")));
  return NextResponse.json({ mediaId: m.id, offset: 0, chunk: CHUNK });
}
