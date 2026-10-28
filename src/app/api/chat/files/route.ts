import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { threadFor } from "@/lib/chat";
import { MEDIA_ROOT } from "@/lib/storage";
import { rateLimit } from "@/lib/ratelimit";

/** Encrypted attachment: opaque bytes, the key never reaches the server. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  if (!rateLimit(`chatfile:${user.id}`, 20, 120)) return NextResponse.json({ error: "Doucement, réessaie dans une minute." }, { status: 429 });
  const t = await threadFor(user.id, new URL(req.url).searchParams.get("thread") ?? "");
  if (!t) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > 10 * 1024 * 1024) return NextResponse.json({ error: "Fichier trop lourd (10 Mo max)" }, { status: 400 });
  const [f] = await db.insert(schema.chatFiles).values({ threadId: t.id, senderId: user.id, bytes: buf.length }).returning({ id: schema.chatFiles.id });
  await mkdir(path.join(MEDIA_ROOT, "chat"), { recursive: true });
  await writeFile(path.join(MEDIA_ROOT, "chat", f.id), buf);
  return NextResponse.json({ id: f.id });
}
