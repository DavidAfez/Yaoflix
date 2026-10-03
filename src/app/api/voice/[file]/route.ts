import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { apiUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { paths } from "@/lib/storage";

const MIME: Record<string, string> = { webm: "audio/webm", m4a: "audio/mp4", ogg: "audio/ogg", mp3: "audio/mpeg", aac: "audio/aac" };

/** Voice notes are only readable by people who can see the insights. */
export async function GET(_: Request, ctx: RouteContext<"/api/voice/[file]">) {
  const user = await apiUser(can.viewInsights);
  if (!user) return new Response(null, { status: 403 });
  const { file } = await ctx.params;
  if (!/^[0-9a-f-]{36}\.(webm|m4a|ogg|mp3|aac)$/.test(file)) return new Response(null, { status: 404 });
  const full = paths.voice(file);
  const s = await stat(full).catch(() => null);
  if (!s) return new Response(null, { status: 404 });
  return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
    headers: { "Content-Type": MIME[file.split(".").pop()!], "Content-Length": String(s.size), "Cache-Control": "private, max-age=3600" },
  });
}
