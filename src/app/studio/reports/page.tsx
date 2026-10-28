import { alias } from "drizzle-orm/pg-core";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getT } from "@/lib/i18n/server";
import { ReportsList } from "./reports";

export async function generateMetadata() {
  const t = await getT();
  return { title: t("Signalements") };
}

export default async function Page(props: PageProps<"/studio/reports">) {
  await requireRole(can.manageUsers);
  const sp = await props.searchParams;
  const view = sp.view === "done" ? "done" : "open";
  const reporter = alias(schema.users, "reporter");
  const target = alias(schema.users, "target");
  const rows = await db
    .select({ r: schema.reports, reporter: reporter.handle, target: target.handle, banned: target.bannedAt })
    .from(schema.reports)
    .leftJoin(reporter, eq(reporter.id, schema.reports.reporterId))
    .leftJoin(target, eq(target.id, schema.reports.targetUserId))
    .where(view === "open" ? eq(schema.reports.status, "open") : undefined)
    .orderBy(desc(schema.reports.createdAt))
    .limit(200);
  return (
    <ReportsList
      view={view}
      rows={rows.map(({ r, reporter, target, banned }) => ({
        id: r.id,
        type: r.targetType,
        targetId: r.targetId,
        reason: r.reason,
        note: r.note,
        snapshot: r.snapshot,
        status: r.status,
        at: r.createdAt.toISOString(),
        reporter,
        target,
        banned: Boolean(banned),
      }))}
    />
  );
}
