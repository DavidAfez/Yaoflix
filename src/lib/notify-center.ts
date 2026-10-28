import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";

type Kind = "ready" | "rejected" | "reply" | "follow" | "fav" | "repost";

/**
 * Adds a line to someone's notification centre. Social pings (fav, repost, follow) from the same
 * person about the same thing are not repeated within a day.
 */
export async function notify(userId: string, kind: Kind, data: { title?: string; handle?: string; href?: string; reason?: string }, actorId?: string) {
  if (actorId && actorId === userId) return;
  if (kind === "fav" || kind === "repost" || kind === "follow") {
    const recent = await db
      .select({ data: schema.notifications.data })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.kind, kind), gt(schema.notifications.createdAt, new Date(Date.now() - 86400_000))));
    if (recent.some((r) => r.data.handle === data.handle && r.data.href === data.href)) return;
  }
  await db.insert(schema.notifications).values({ userId, kind, data }).catch(() => undefined);
}
