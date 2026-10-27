import { NextResponse } from "next/server";
import { and, asc, ilike, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { searchTitles } from "@/lib/tmdb";
import { readyTitleIds } from "@/lib/recos";
import { toPoster } from "@/lib/view";
import { rateLimit } from "@/lib/ratelimit";

export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  if (!rateLimit(`search:${user.id}`, 30, 30)) return NextResponse.json({ results: [] }, { status: 429 });
  const q = new URL(req.url).searchParams.get("q") ?? "";

  // "@name" looks for members, by pseudonym only
  if (q.trim().startsWith("@")) {
    const term = q.trim().slice(1).toLowerCase().replace(/[^a-z0-9_.]/g, "");
    const people = await db
      .select({
        handle: schema.users.handle,
        seen: sql<number>`(select count(*)::int from seen s where s.user_id = "users"."id")`,
        reviews: sql<number>`(select count(*)::int from feedback f where f.user_id = "users"."id")`,
      })
      .from(schema.users)
      .where(and(isNull(schema.users.bannedAt), ne(schema.users.id, user.id), term ? ilike(schema.users.handle, `%${term}%`) : undefined))
      .orderBy(sql`position(${term} in ${schema.users.handle})`, asc(schema.users.handle))
      .limit(30);
    return NextResponse.json({ results: [], people });
  }

  const rows = await searchTitles(q);
  const ready = await readyTitleIds(rows.map((r) => r.id));
  return NextResponse.json({ results: rows.map((r) => toPoster(r, ready.has(r.id))) });
}
