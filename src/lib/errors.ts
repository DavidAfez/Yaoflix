import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { sha256 } from "./crypto";

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
  } catch (inner) {
    console.error("[logError]", inner, err);
  }
}
