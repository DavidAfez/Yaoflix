import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { apiUser } from "@/lib/auth";
import { db, schema } from "@/db";
import { paths } from "@/lib/storage";
import { rateLimit } from "@/lib/ratelimit";
import { enqueue } from "@/lib/jobs";
import { markSeen, titleIdFor } from "@/lib/marks";

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_TEXT = 2000;
const EXT: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac" };

/**
 * A review: a voice note, a short text, or both. The title comes as titleId, or as kind + tmdbId from a poster.
 * Giving a review means the member has seen the title.
 */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  if (!rateLimit(`fb:${user.id}`, 20, 3600)) return NextResponse.json({ error: "limit" }, { status: 429 });
  const form = await req.formData();
  const audio = form.get("audio");
  const text = String(form.get("text") ?? "").trim().slice(0, MAX_TEXT);
  const duration = Math.round(Number(form.get("duration")) || 0);

  let titleId: number | null = Number(form.get("titleId")) || null;
  const kind = String(form.get("kind") ?? "");
  const tmdbId = Number(form.get("tmdbId"));
  if (!titleId && (kind === "movie" || kind === "tv") && Number.isInteger(tmdbId)) titleId = await titleIdFor(kind, tmdbId);

  let file: string | null = null;
  let mime: string | null = null;
  if (audio instanceof Blob && audio.size > 0) {
    if (audio.size > MAX_BYTES) return NextResponse.json({ error: "audio" }, { status: 400 });
    mime = audio.type.split(";")[0];
    const ext = EXT[mime];
    if (!ext) return NextResponse.json({ error: "type" }, { status: 415 });
    await mkdir(paths.voiceDir, { recursive: true });
    file = `${randomUUID()}.${ext}`;
    await writeFile(paths.voice(file), Buffer.from(await audio.arrayBuffer()));
  }
  if (!file && !text) return NextResponse.json({ error: "empty" }, { status: 400 });

  const [fb] = await db
    .insert(schema.feedback)
    .values({ userId: user.id, titleId, audioFile: file, mime, text: text || null, durationSec: duration || null, source: "web" })
    .returning({ id: schema.feedback.id });
  if (file) await enqueue("transcribe", { feedbackId: fb.id });
  if (titleId) await markSeen(user.id, titleId, "review");
  // Every review is also a post in the feed. A voice note shows its transcript once the worker has it
  await db.insert(schema.posts).values({ userId: user.id, titleId, feedbackId: fb.id, body: text || null });
  return NextResponse.json({ ok: true });
}
