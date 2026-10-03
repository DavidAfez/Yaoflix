import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { sha256 } from "@/lib/crypto";
import { paths, safeJoin } from "@/lib/storage";

// Segment requests arrive every few seconds per viewer: cache the authorization briefly
const TTL = 60_000;
const authCache = new Map<string, { mediaId: string; until: number }>();

const ALLOWED = /^(master\.m3u8|s\d{1,2}\/(index\.m3u8|\d{5}\.ts)|subs\/[\w.-]{1,64}\.vtt)$/;
const TYPES: Record<string, string> = {
  m3u8: "application/vnd.apple.mpegurl",
  ts: "video/mp2t",
  vtt: "text/vtt; charset=utf-8",
};

async function authorize(grantId: string): Promise<string | null> {
  const token = (await cookies()).get("yf_s")?.value;
  if (!token || !/^[0-9a-f-]{36}$/.test(grantId)) return null;
  const key = `${sha256(token)}:${grantId}`;
  const hit = authCache.get(key);
  if (hit && hit.until > Date.now()) return hit.mediaId;

  const [row] = await db
    .select({ mediaId: schema.accessGrants.mediaId })
    .from(schema.accessGrants)
    .innerJoin(schema.sessions, eq(schema.sessions.userId, schema.accessGrants.userId))
    .innerJoin(schema.users, eq(schema.users.id, schema.accessGrants.userId))
    .innerJoin(schema.media, eq(schema.media.id, schema.accessGrants.mediaId))
    .where(
      and(
        eq(schema.accessGrants.id, grantId),
        eq(schema.sessions.id, sha256(token)),
        gt(schema.sessions.expiresAt, new Date()),
        gt(schema.accessGrants.expiresAt, new Date()),
        isNull(schema.accessGrants.revokedAt),
        isNull(schema.users.bannedAt),
        eq(schema.media.status, "READY"),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (authCache.size > 20_000) authCache.clear();
  authCache.set(key, { mediaId: row.mediaId, until: Date.now() + TTL });
  return row.mediaId;
}

export async function GET(req: Request, ctx: RouteContext<"/api/stream/[grant]/[...path]">) {
  const { grant, path } = await ctx.params;
  const rel = path.join("/");
  if (!ALLOWED.test(rel)) return new Response(null, { status: 404 });
  const mediaId = await authorize(grant);
  if (!mediaId) return new Response(null, { status: 403 });

  const root = paths.hlsDir(mediaId);
  const file = safeJoin(root, rel);
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
    // Segments never change: let the browser keep them. Private so no shared cache stores them.
    "Cache-Control": ext === "ts" ? "private, max-age=86400, immutable" : "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
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
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, { status: 200, headers });
}
