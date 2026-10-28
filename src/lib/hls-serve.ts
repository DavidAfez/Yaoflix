import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { paths, safeJoin } from "./storage";

export const ALLOWED = /^(master\.m3u8|s\d{1,2}\/(index\.m3u8|\d{5}\.ts)|subs\/[\w.-]{1,64}\.vtt|thumbs\.json|thumbs\/\d{3}\.jpg)$/;
const TYPES: Record<string, string> = {
  m3u8: "application/vnd.apple.mpegurl",
  ts: "video/mp2t",
  vtt: "text/vtt; charset=utf-8",
  json: "application/json",
  jpg: "image/jpeg",
};

/**
 * Anti-download pacing: every grant gets a bucket of 40 segments refilled at one segment every
 * 1.5 s. Watching (even at 2x, 4 s segments) never empties it; a downloader pulling the whole film
 * at once is slowed to about real time.
 */
const buckets = new Map<string, { tokens: number; at: number }>();
export function paced(key: string): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: 40, at: now };
  b.tokens = Math.min(40, b.tokens + (now - b.at) / 1500);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  if (buckets.size > 50_000) buckets.clear();
  buckets.set(key, b);
  return true;
}

/** Serves one HLS file of a media with Range support. */
export async function serveHls(req: Request, mediaId: string, rel: string, extra: Record<string, string> = {}) {
  if (!ALLOWED.test(rel)) return new Response(null, { status: 404 });
  const file = safeJoin(paths.hlsDir(mediaId), rel);
  if (!file) return new Response(null, { status: 404 });
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return new Response(null, { status: 404 });
  }
  const ext = rel.split(".").pop()!;
  const headers = new Headers({
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": ext === "ts" ? "private, max-age=86400, immutable" : "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  const range = req.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers });
}
