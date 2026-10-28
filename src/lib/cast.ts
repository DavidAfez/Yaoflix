import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { blindIndex, safeEqual } from "./crypto";

const HOURS = 6;

/**
 * A TV (Chromecast, Apple TV) fetches the video itself, without the member's cookie.
 * It gets a signed URL instead: grant id + expiry + HMAC, valid a few hours, tied to a live grant.
 */
export function castToken(grantId: string) {
  const exp = Math.floor(Date.now() / 1000) + HOURS * 3600;
  return `${grantId}.${exp}.${blindIndex(`${grantId}.${exp}`, "cast")}`;
}

export async function castMedia(token: string): Promise<string | null> {
  const [grantId, exp, sig] = token.split(".");
  if (!grantId || !exp || !sig || !/^[0-9a-f-]{36}$/.test(grantId) || Number(exp) * 1000 < Date.now()) return null;
  if (!safeEqual(sig, blindIndex(`${grantId}.${exp}`, "cast"))) return null;
  const [g] = await db
    .select({ mediaId: schema.accessGrants.mediaId })
    .from(schema.accessGrants)
    .innerJoin(schema.media, eq(schema.media.id, schema.accessGrants.mediaId))
    .where(and(eq(schema.accessGrants.id, grantId), gt(schema.accessGrants.expiresAt, new Date()), isNull(schema.accessGrants.revokedAt), eq(schema.media.status, "READY")));
  return g?.mediaId ?? null;
}
