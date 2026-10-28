import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { sha256 } from "@/lib/crypto";
import { ALLOWED, paced, serveHls } from "@/lib/hls-serve";

// Segment requests arrive every few seconds per viewer: cache the authorization briefly
const TTL = 60_000;
const authCache = new Map<string, { mediaId: string; until: number }>();


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
  if (rel.endsWith(".ts") && !paced(grant)) return new Response(null, { status: 429, headers: { "Retry-After": "2" } });
  return serveHls(req, mediaId, rel);
}
