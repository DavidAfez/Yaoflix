import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { apiUser } from "@/lib/auth";
import { can } from "@/lib/rbac";

import type { StudioNotif } from "@/components/studio-bell";

/** What waits for the staff, filtered by what each role may act on. */
export async function GET() {
  const user = await apiUser(can.isStaff);
  if (!user) return NextResponse.json({ items: [] }, { status: 403 });
  const [c] = (
    await db.execute<{ requests: number; approve: number; reports: number; errors: number; failed: number }>(sql`
      select
        (select count(distinct title_id)::int from requests where status = 'PENDING') as requests,
        (select count(*)::int from users where email_verified_at is not null and approved_at is null and banned_at is null) as approve,
        (select count(*)::int from error_logs where resolved_at is null and source = 'user') as reports,
        (select count(*)::int from error_logs where resolved_at is null and source <> 'user') as errors,
        (select count(*)::int from media where status = 'FAILED') as failed
    `)
  ).rows;
  const r = user.role;
  const items: StudioNotif[] = [
    can.handleRequests(r) && { key: "requests", label: "Demandes à traiter", count: c.requests, href: "/studio" },
    can.manageUsers(r) && { key: "approve", label: "Comptes à valider", count: c.approve, href: "/studio/members" },
    can.viewErrors(r) && { key: "reports", label: "Bugs signalés", count: c.reports, href: "/studio/errors?source=user" },
    can.viewErrors(r) && { key: "errors", label: "Erreurs ouvertes", count: c.errors, href: "/studio/errors" },
    can.upload(r) && { key: "failed", label: "Encodages en échec", count: c.failed, href: "/studio/library" },
  ].filter((x): x is StudioNotif => Boolean(x) && (x as StudioNotif).count > 0);
  return NextResponse.json({ items });
}
