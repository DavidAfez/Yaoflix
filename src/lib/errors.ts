import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { sha256 } from "./crypto";

export type ErrorSource = "server" | "client" | "player" | "worker" | "mail" | "whatsapp";

/** Groups identical errors by fingerprint so the backlog stays readable. Never throws. */
export async function logError(source: ErrorSource, err: unknown, context: Record<string, unknown> = {}) {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const message = e.message.slice(0, 2000);
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
