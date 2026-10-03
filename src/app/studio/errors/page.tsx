import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Backlog } from "./backlog";

export default async function Page(props: PageProps<"/studio/errors">) {
  const user = await requireRole(can.viewErrors);
  const sp = await props.searchParams;
  const view = sp.view === "done" ? "done" : "open";
  const source = typeof sp.source === "string" ? sp.source : "";
  const rows = await db
    .select()
    .from(schema.errorLogs)
    .where(
      and(
        view === "done" ? isNotNull(schema.errorLogs.resolvedAt) : isNull(schema.errorLogs.resolvedAt),
        source ? eq(schema.errorLogs.source, source) : undefined,
      ),
    )
    .orderBy(desc(schema.errorLogs.lastSeen))
    .limit(200);
  const counts = await db
    .select({ source: schema.errorLogs.source, n: sql<number>`count(*)::int` })
    .from(schema.errorLogs)
    .where(isNull(schema.errorLogs.resolvedAt))
    .groupBy(schema.errorLogs.source);

  return (
    <Backlog
      view={view}
      source={source}
      counts={Object.fromEntries(counts.map((c) => [c.source, c.n]))}
      canResolve={can.resolveErrors(user.role)}
      canPurge={can.purgeErrors(user.role)}
      rows={rows.map((r) => ({
        id: r.id,
        source: r.source,
        message: r.message,
        stack: r.stack,
        context: r.context,
        count: r.count,
        firstSeen: r.firstSeen.toISOString(),
        lastSeen: r.lastSeen.toISOString(),
        resolved: Boolean(r.resolvedAt),
      }))}
    />
  );
}
