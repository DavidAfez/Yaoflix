import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { sha256 } from "./crypto";
import { queueMail } from "./jobs";

export type ErrorSource = "server" | "client" | "player" | "worker" | "mail" | "whatsapp";

/** Not bugs: the visitor left before the page finished streaming. */
const NOISE = [/destination stream closed early/i, /^aborted$/i, /ECONNRESET/, /The user aborted a request/i];

/**
 * "Failed query" and "fetch failed" hide the real reason in `cause` (database down, no
 * internet...). The query parameters are dropped: they can hold private values.
 */
function describe(e: Error) {
  let message = e.message.replace(/\nparams: [\s\S]*$/, "").replace(/ params: .*$/s, "");
  const cause = e.cause instanceof Error ? e.cause : null;
  if (cause) {
    const code = (cause as Error & { code?: string }).code;
    message = `${message.split("\n")[0]} → ${code ? `${code} ` : ""}${cause.message}`;
  }
  return message;
}

/** Groups identical errors by fingerprint so the backlog stays readable. Never throws. */
export async function logError(source: ErrorSource, err: unknown, context: Record<string, unknown> = {}) {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    if (NOISE.some((r) => r.test(e.message))) return;
    const message = describe(e).slice(0, 2000);
    const stack = e.stack?.slice(0, 8000) ?? null;
    const firstFrame = stack?.split("\n")[1]?.trim() ?? "";
    const fingerprint = sha256(`${source}|${message.replace(/\d+/g, "#")}|${firstFrame.replace(/:\d+:\d+/g, "")}`);
    const [before] = await db.select({ resolvedAt: schema.errorLogs.resolvedAt }).from(schema.errorLogs).where(eq(schema.errorLogs.fingerprint, fingerprint));
    await db
      .insert(schema.errorLogs)
      .values({ fingerprint, source, message, stack, context })
      .onConflictDoUpdate({
        target: schema.errorLogs.fingerprint,
        set: {
          count: sql`${schema.errorLogs.count} + 1`,
          lastSeen: new Date(),
          context,
          resolvedAt: null,
          resolvedBy: null,
        },
      });
    // Mail only what is new: a first occurrence, or one back after being marked resolved
    if (!before || before.resolvedAt) await mailStaff(source, message, context);
  } catch (inner) {
    console.error("[logError]", inner, err);
  }
}

const MAX_PER_HOUR = 10;

/** Staff who switched error mails on. A failing mail never mails about itself. */
async function mailStaff(source: ErrorSource, message: string, context: Record<string, unknown>) {
  if (source === "mail") return;
  const staff = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.errorMails, true), isNull(schema.users.bannedAt), inArray(schema.users.role, ["UPLOADER", "MODERATOR", "DEV"])));
  if (!staff.length) return;
  // A burst of new errors must not become a burst of mails
  const [{ n }] = (
    await db.execute<{ n: number }>(sql`select count(*)::int as n from jobs where type = 'mail' and payload->>'template' = 'error' and created_at > now() - interval '1 hour'`)
  ).rows;
  if (n >= MAX_PER_HOUR) return;
  const where = String(context.path ?? context.where ?? context.job ?? "");
  for (const u of staff) await queueMail(u.id, "error", { source, message: message.slice(0, 500), where, link: `${process.env.APP_URL ?? ""}/studio/errors?source=${source}` });
}
