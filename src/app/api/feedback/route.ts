import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { apiUser } from "@/lib/auth";
import { db, schema } from "@/db";
import { paths } from "@/lib/storage";
import { rateLimit } from "@/lib/ratelimit";
import { enqueue } from "@/lib/jobs";

const MAX_BYTES = 6 * 1024 * 1024;
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac" };

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  if (!rateLimit(`fb:${user.id}`, 10, 3600)) return NextResponse.json({ error: "limit" }, { status: 429 });
  const form = await req.formData();
  const audio = form.get("audio");
  const titleId = Number(form.get("titleId"));
  const duration = Math.round(Number(form.get("duration")) || 0);
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_BYTES) return NextResponse.json({ error: "audio" }, { status: 400 });
  const mime = audio.type.split(";")[0];
  const ext = EXT[mime];
  if (!ext) return NextResponse.json({ error: "type" }, { status: 415 });

  await mkdir(paths.voiceDir, { recursive: true });
  const file = `${randomUUID()}.${ext}`;
  await writeFile(paths.voice(file), Buffer.from(await audio.arrayBuffer()));
  const [fb] = await db.insert(schema.feedback).values({
    userId: user.id,
    titleId: Number.isFinite(titleId) && titleId > 0 ? titleId : null,
    audioFile: file,
    mime,
    durationSec: duration || null,
    source: "web",
  }).returning({ id: schema.feedback.id });
  await enqueue("transcribe", { feedbackId: fb.id });
  return NextResponse.json({ ok: true });
}
