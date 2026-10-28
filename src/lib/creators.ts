import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { can } from "./rbac";
import type { SessionUser } from "./auth";

/** Approved creators, and staff (who can upload anything anyway). */
export const isCreator = (u: Pick<SessionUser, "role" | "creator">) => u.creator === "approved" || can.upload(u.role);

/** Staff upload any title; a creator only their own projects. */
export async function mayUpload(u: SessionUser, titleId: number) {
  if (can.upload(u.role)) return true;
  if (u.creator !== "approved") return false;
  const [t] = await db.select({ id: schema.titles.id }).from(schema.titles).where(and(eq(schema.titles.id, titleId), eq(schema.titles.creatorId, u.id)));
  return Boolean(t);
}

/** Same check from a media id (chunks, subtitles, completion). */
export async function mayUploadMedia(u: SessionUser, mediaId: string) {
  if (can.upload(u.role)) return true;
  const [m] = await db.select({ titleId: schema.media.titleId, by: schema.media.uploadedBy }).from(schema.media).where(eq(schema.media.id, mediaId));
  return Boolean(m && m.by === u.id && (await mayUpload(u, m.titleId)));
}

/** Next free local id: creator projects count down from -1 so they never meet TMDB ids. */
export async function nextLocalId() {
  const [r] = await db.select({ n: sql<number>`coalesce(min(${schema.titles.tmdbId}), 0)::int - 1` }).from(schema.titles).where(sql`${schema.titles.tmdbId} < 0`);
  return Math.min(-1, r.n);
}

export async function ownsImages(userId: string, ids: string[]) {
  if (!ids.length) return true;
  const own = await db.select({ id: schema.images.id }).from(schema.images).where(and(eq(schema.images.userId, userId), inArray(schema.images.id, ids)));
  return own.length === new Set(ids).size;
}
