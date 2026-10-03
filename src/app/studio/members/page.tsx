import { desc, ilike, sql, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Members } from "./members";

export default async function Page(props: PageProps<"/studio/members">) {
  const me = await requireRole(can.manageUsers);
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase().slice(0, 40) : "";
  const rows = await db
    .select({
      id: schema.users.id,
      handle: schema.users.handle,
      role: schema.users.role,
      age: schema.users.ageBracket,
      sex: schema.users.sex,
      country: schema.users.country,
      createdAt: schema.users.createdAt,
      lastSeenAt: schema.users.lastSeenAt,
      bannedAt: schema.users.bannedAt,
      verified: schema.users.emailVerifiedAt,
      requests: sql<number>`(select count(*)::int from requests r where r.user_id = ${schema.users.id})`,
      watched: sql<number>`(select count(*)::int from watch_sessions w where w.user_id = ${schema.users.id})`,
    })
    .from(schema.users)
    .where(q ? ilike(schema.users.handle, `%${q.replace(/[%_]/g, "")}%`) : undefined)
    .orderBy(desc(schema.users.createdAt))
    .limit(200);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  const staff = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.role, "USER"));

  return (
    <Members
      me={{ id: me.id, role: me.role }}
      total={n}
      staff={n - staff[0].n}
      q={q}
      rows={rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
        bannedAt: r.bannedAt?.toISOString() ?? null,
        verified: Boolean(r.verified),
      }))}
    />
  );
}
