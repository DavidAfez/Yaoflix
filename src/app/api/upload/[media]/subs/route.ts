import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { paths } from "@/lib/storage";

const toVtt = (srt: string) =>
  "WEBVTT\n\n" +
  srt
    .replace(/^﻿/, "")
    .replace(/\r/g, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .trim() +
  "\n";

const LABEL: Record<string, string> = { fr: "FR", en: "EN", es: "ES", de: "DE", it: "IT" };

/** Sidecar subtitles (.srt or .vtt) uploaded by staff, served next to the HLS renditions. */
export async function POST(req: Request, ctx: RouteContext<"/api/upload/[media]/subs">) {
  const user = await apiUser(can.upload);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { media: id } = await ctx.params;
  const [m] = await db.select().from(schema.media).where(eq(schema.media.id, id));
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  const lang = String(form.get("lang") ?? "fr").toLowerCase().replace(/[^a-z]/g, "").slice(0, 3) || "fr";
  if (!(file instanceof Blob) || file.size > 2_000_000) return NextResponse.json({ error: "file" }, { status: 400 });
  const text = await file.text();
  const vtt = text.trimStart().startsWith("WEBVTT") ? text : toVtt(text);

  const rel = `subs/up-${lang}.vtt`;
  const dir = paths.hlsDir(id);
  await mkdir(path.join(dir, "subs"), { recursive: true });
  await writeFile(path.join(dir, rel), vtt);
  const subtitles = [...m.subtitles.filter((s) => s.file !== rel), { lang, label: LABEL[lang] ?? lang.toUpperCase(), file: rel }];
  await db.update(schema.media).set({ subtitles }).where(eq(schema.media.id, id));
  return NextResponse.json({ ok: true });
}
