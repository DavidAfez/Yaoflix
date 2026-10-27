"use server";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { rateLimit } from "@/lib/ratelimit";

export type BugState = { ok?: boolean; error?: string } | undefined;

/** A member's bug report lands in the studio error backlog, source "user". */
export async function reportBug(_: BugState, form: FormData): Promise<BugState> {
  const user = await requireUser();
  if (!rateLimit(`bug:${user.id}`, 5, 600)) return { error: "Trop de messages, réessaie plus tard." };
  const text = String(form.get("text") ?? "").trim().slice(0, 4000);
  if (text.length < 5) return { error: "Décris le souci en quelques mots." };
  const from = String(form.get("from") ?? "").slice(0, 300);
  await db.insert(schema.errorLogs).values({
    // Each report stays on its own line in the backlog
    fingerprint: `user:${randomToken(12)}`,
    source: "user",
    message: text,
    context: { from, handle: user.handle, ua: String(form.get("ua") ?? "").slice(0, 300) },
  });
  return { ok: true };
}
