import "server-only";
import { and, desc, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type ProfileHead = {
  id: string;
  handle: string;
  bio: string | null;
  avatarId: string | null;
  bannerId: string | null;
  joined: string;
  followers: number;
  follows: number;
  following: boolean;
  blocked: boolean;
};

/** What the top of a profile shows. No age, sex, country or contact: only what the member chose to share. */
export async function profileHead(me: string, userId: string): Promise<ProfileHead | null> {
  const [u] = await db
    .select({ id: schema.users.id, handle: schema.users.handle, bio: schema.users.bio, avatarId: schema.users.avatarId, bannerId: schema.users.bannerId, createdAt: schema.users.createdAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!u) return null;
  const [c] = (
    await db.execute<{ followers: number; follows: number; following: boolean; blocked: boolean }>(sql`
      select (select count(*)::int from follows where followee_id = ${userId}) as followers,
        (select count(*)::int from follows where follower_id = ${userId}) as follows,
        exists(select 1 from follows where follower_id = ${me} and followee_id = ${userId}) as following,
        exists(select 1 from blocks where blocker_id = ${me} and blocked_id = ${userId}) as blocked
    `)
  ).rows;
  return { ...u, joined: u.createdAt.toISOString(), ...c };
}

export async function topLists(userId: string) {
  const [current] = await db
    .select({ id: schema.topLists.id, items: schema.topLists.items, at: schema.topLists.createdAt })
    .from(schema.topLists)
    .where(and(eq(schema.topLists.userId, userId), isNull(schema.topLists.archivedAt)))
    .orderBy(desc(schema.topLists.createdAt))
    .limit(1);
  const history = await db
    .select({ id: schema.topLists.id, items: schema.topLists.items, at: schema.topLists.createdAt })
    .from(schema.topLists)
    .where(and(eq(schema.topLists.userId, userId), isNotNull(schema.topLists.archivedAt)))
    .orderBy(desc(schema.topLists.createdAt))
    .limit(20);
  const ser = (r: { id: number; items: unknown; at: Date }) => ({ id: r.id, items: r.items as import("@/db/schema").TitleRef[], at: r.at.toISOString() });
  return { current: current ? ser(current) : null, history: history.map(ser) };
}
