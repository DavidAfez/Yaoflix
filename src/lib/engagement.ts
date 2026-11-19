// No "server-only" marker: the pure helpers are unit tested; the writes need the database anyway
import { createHash } from "node:crypto";
import { db, schema } from "@/db";

export type Group = "test" | "holdout";
export const FEATURES = ["welcome", "pick", "near", "trophy"] as const;
export type Feature = (typeof FEATURES)[number];
export const ACTIONS = ["shown", "click", "unlock"] as const;

/** Share of members who never see the nudges, to compare against (0 to 50 %, 10 % by default). */
export function holdoutShare() {
  const n = Number(process.env.RETENTION_HOLDOUT ?? 10);
  return Number.isFinite(n) ? Math.min(50, Math.max(0, n)) : 10;
}

/**
 * A member's group never changes: it comes from a hash of their id, so nothing is stored and
 * the split stays the same across visits and devices.
 */
export function group(userId: string, share = holdoutShare()): Group {
  const h = createHash("sha256").update(`retention-v1:${userId}`).digest();
  return (h.readUInt16BE(0) / 0x10000) * 100 < share ? "holdout" : "test";
}

/** Two-sided p-value of a difference between two rates (normal approximation). */
export function twoProportionP(x1: number, n1: number, x2: number, n2: number) {
  if (!n1 || !n2) return null;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  const z = Math.abs(x1 / n1 - x2 / n2) / se;
  // Abramowitz-Stegun approximation of the normal tail
  const t = 1 / (1 + 0.2316419 * z);
  const d = Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI);
  const tail = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return Math.min(1, 2 * tail);
}

export async function track(userId: string, feature: Feature, action: (typeof ACTIONS)[number], key: string | null, grp: Group = group(userId)) {
  await db.insert(schema.engagementEvents).values({ userId, feature, action, key: key?.slice(0, 80) ?? null, grp }).catch(() => undefined);
}
