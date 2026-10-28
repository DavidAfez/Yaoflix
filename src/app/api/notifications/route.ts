import { NextResponse } from "next/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { StudioNotif } from "@/components/studio-bell";

/** The member's notification centre, plus the studio inbox for staff. */
export async function GET() {
  const user = await apiUser();
  if (!user) return NextResponse.json({ items: [], unread: 0, studio: [] }, { status: 401 });
  const items = await db
    .select({ id: schema.notifications.id, kind: schema.notifications.kind, data: schema.notifications.data, readAt: schema.notifications.readAt, at: schema.notifications.createdAt })
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(40);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  const [{ chat }] = (
    await db.execute<{ chat: number }>(sql`
      select count(*)::int as chat from chat_threads t
      where (t.a = ${user.id} or t.b = ${user.id}) and exists(
        select 1 from chat_messages m where m.thread_id = t.id and m.sender_id <> ${user.id}
          and m.created_at > coalesce((select r.at from chat_reads r where r.thread_id = t.id and r.user_id = ${user.id}), 'epoch'))
    `)
  ).rows;
  // A new device of this member waiting for one of the others to let it in
  const [{ devices }] = (
    await db.execute<{ devices: number }>(sql`select count(*)::int as devices from chat_devices where user_id = ${user.id} and approved_at is null and revoked_at is null`)
  ).rows;
  return NextResponse.json({ items, unread: n, chat, devices, studio: can.isStaff(user.role) ? await studio(user.role) : [] });
}

/** Everything is read once the panel has been opened. */
export async function POST() {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  await db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  return NextResponse.json({ ok: true });
}

async function studio(r: Parameters<typeof can.isStaff>[0]): Promise<StudioNotif[]> {
  const [c] = (
    await db.execute<{ requests: number; approve: number; reports: number; errors: number; failed: number; flags: number }>(sql`
      select
        (select count(distinct title_id)::int from requests where status = 'PENDING') as requests,
        (select count(*)::int from users where email_verified_at is not null and approved_at is null and banned_at is null) as approve,
        (select count(*)::int from error_logs where resolved_at is null and source = 'user') as reports,
        (select count(*)::int from error_logs where resolved_at is null and source <> 'user') as errors,
        (select count(*)::int from media where status = 'FAILED') as failed,
        (select count(*)::int from reports where status = 'open') as flags
    `)
  ).rows;
  return [
    can.handleRequests(r) && { key: "requests", label: "Demandes à traiter", count: c.requests, href: "/studio" },
    can.manageUsers(r) && { key: "approve", label: "Comptes à valider", count: c.approve, href: "/studio/members" },
    can.manageUsers(r) && { key: "flags", label: "Signalements", count: c.flags, href: "/studio/reports" },
    can.viewErrors(r) && { key: "reports", label: "Bugs signalés", count: c.reports, href: "/studio/errors?source=user" },
    can.viewErrors(r) && { key: "errors", label: "Erreurs ouvertes", count: c.errors, href: "/studio/errors" },
    can.upload(r) && { key: "failed", label: "Encodages en échec", count: c.failed, href: "/studio/library" },
  ].filter((x): x is StudioNotif => Boolean(x) && (x as StudioNotif).count > 0);
}
