import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { paths } from "@/lib/storage";
import { rateLimit } from "@/lib/ratelimit";

const TYPES: Record<string, number[][]> = {
  // Magic bytes: the declared type is never trusted
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/gif": [[0x47, 0x49, 0x46, 0x38]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]],
};
const MAX = 8 * 1024 * 1024;

/** Upload one picture (posts, chat, profile). Returns its id. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  if (!rateLimit(`img:${user.id}`, 20, 120)) return NextResponse.json({ error: "Doucement, réessaie dans une minute." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size > MAX || file.size < 16) return NextResponse.json({ error: "Image trop lourde (8 Mo max)" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = Object.entries(TYPES).find(([, sigs]) => sigs.some((sig) => sig.every((b, i) => buf[i] === b)))?.[0];
  if (!mime) return NextResponse.json({ error: "Format non pris en charge" }, { status: 400 });
  const [row] = await db.insert(schema.images).values({ userId: user.id, mime, bytes: buf.length }).returning({ id: schema.images.id });
  await mkdir(paths.imagesDir, { recursive: true });
  await writeFile(paths.image(row.id), buf);
  return NextResponse.json({ id: row.id });
}
