import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { blockedBetween } from "@/lib/chat";
import { rateLimit } from "@/lib/ratelimit";

/** The member's conversations, newest first; ready says whether the other side has a device yet. */
export async function GET() {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const rows = (
    await db.execute<{ id: string; other_id: string; handle: string; avatar_id: string | null; ready: boolean; last_at: Date; unread: boolean }>(sql`
      select t.id, u.id as other_id, u.handle, u.avatar_id, t.last_at,
        exists(select 1 from chat_devices d where d.user_id = u.id and d.approved_at is not null and d.revoked_at is null) as ready,
        exists(select 1 from chat_messages m where m.thread_id = t.id and m.sender_id <> ${user.id}
          and m.created_at > coalesce((select r.at from chat_reads r where r.thread_id = t.id and r.user_id = ${user.id}), 'epoch')) as unread
      from chat_threads t
      join users u on u.id = case when t.a = ${user.id} then t.b else t.a end
      where (t.a = ${user.id} or t.b = ${user.id}) and u.banned_at is null
      order by t.last_at desc limit 100
    `)
  ).rows;
  return NextResponse.json({
    threads: rows.map((r) => ({ id: r.id, other: { id: r.other_id, handle: r.handle, avatarId: r.avatar_id, ready: r.ready }, lastAt: new Date(r.last_at).toISOString(), unread: r.unread })),
  });
}

/** Opens (or finds) the conversation with someone. */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  if (!rateLimit(`thread:${user.id}`, 20, 600)) return NextResponse.json({ error: "Doucement, réessaie dans une minute." }, { status: 429 });
  const { handle } = ((await req.json().catch(() => ({}))) ?? {}) as { handle?: string };
  const [other] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.handle, String(handle ?? "").toLowerCase()), isNull(schema.users.bannedAt)));
  if (!other || other.id === user.id) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (await blockedBetween(user.id, other.id)) return NextResponse.json({ error: "Impossible d'écrire à ce membre" }, { status: 403 });
  const [a, b] = [user.id, other.id].sort();
  await db.insert(schema.chatThreads).values({ a, b }).onConflictDoNothing();
  const [t] = await db.select({ id: schema.chatThreads.id }).from(schema.chatThreads).where(and(eq(schema.chatThreads.a, a), eq(schema.chatThreads.b, b)));
  return NextResponse.json({ id: t.id });
}
