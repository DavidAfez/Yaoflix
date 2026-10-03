import { and, eq, gt, isNull, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { RequestPrefs } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";
import { queueMail, queueWhatsApp } from "./jobs";

export const GRANT_DAYS = 7;

export async function createGrant(opts: {
  userId: string;
  mediaId: string;
  requestId?: string | null;
  prefs?: RequestPrefs | null;
}) {
  const token = randomToken(24);
  await db.insert(schema.accessGrants).values({
    tokenHash: sha256(token),
    userId: opts.userId,
    mediaId: opts.mediaId,
    requestId: opts.requestId ?? null,
    prefs: opts.prefs ?? null,
    expiresAt: new Date(Date.now() + GRANT_DAYS * 86400_000),
  });
  return token;
}

export const watchUrl = (token: string) => `${process.env.APP_URL ?? "http://localhost:3000"}/w/${token}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A grant is valid only for its owner, before expiry, and while the media is READY.
 * `key` is either the token from the mail, or the grant id when opened from inside the app.
 */
export async function resolveGrant(key: string, userId: string) {
  const [row] = await db
    .select({ grant: schema.accessGrants, media: schema.media, title: schema.titles })
    .from(schema.accessGrants)
    .innerJoin(schema.media, eq(schema.media.id, schema.accessGrants.mediaId))
    .innerJoin(schema.titles, eq(schema.titles.id, schema.media.titleId))
    .where(
      and(
        UUID.test(key) ? eq(schema.accessGrants.id, key) : eq(schema.accessGrants.tokenHash, sha256(key)),
        eq(schema.accessGrants.userId, userId),
        gt(schema.accessGrants.expiresAt, new Date()),
        isNull(schema.accessGrants.revokedAt),
        eq(schema.media.status, "READY"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Called when a media turns READY: fulfills every open request for that title,
 * then notifies watchlist members who did not request it.
 */
export async function fulfillTitle(mediaId: string, titleId: number) {
  const open = await db
    .select()
    .from(schema.requests)
    .where(and(eq(schema.requests.titleId, titleId), inArray(schema.requests.status, ["PENDING", "IN_PROGRESS"])));
  const served = new Set<string>();
  for (const r of open) {
    if (!r.userId || served.has(r.userId)) continue;
    served.add(r.userId);
    const token = await createGrant({ userId: r.userId, mediaId, requestId: r.id, prefs: r.prefs });
    await notifyReady(r.userId, titleId, token, "ready");
  }
  await db
    .update(schema.requests)
    .set({ status: "FULFILLED", handledAt: new Date() })
    .where(and(eq(schema.requests.titleId, titleId), inArray(schema.requests.status, ["PENDING", "IN_PROGRESS"])));

  const fans = await db
    .select({ userId: schema.watchlist.userId })
    .from(schema.watchlist)
    .where(and(eq(schema.watchlist.titleId, titleId), isNull(schema.watchlist.notifiedAt)));
  for (const f of fans) {
    if (served.has(f.userId)) continue;
    const token = await createGrant({ userId: f.userId, mediaId });
    await notifyReady(f.userId, titleId, token, "watchlist-ready");
  }
  await db
    .update(schema.watchlist)
    .set({ notifiedAt: new Date() })
    .where(and(eq(schema.watchlist.titleId, titleId), isNull(schema.watchlist.notifiedAt)));
}

async function notifyReady(userId: string, titleId: number, token: string, template: "ready" | "watchlist-ready") {
  const [title] = await db.select({ name: schema.titles.name }).from(schema.titles).where(eq(schema.titles.id, titleId));
  const data = { title: title?.name ?? "", link: watchUrl(token), days: GRANT_DAYS };
  await queueMail(userId, template, data);
  await queueWhatsApp(userId, template, data);
}
