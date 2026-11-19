import { sql } from "drizzle-orm";
import { db } from "@/db";

/** For an uptime monitor or the host: is the app up, and does it reach its database? Nothing else. */
export async function GET() {
  const dbOk = await db.execute(sql`select 1`).then(
    () => true,
    () => false,
  );
  return Response.json({ ok: dbOk }, { status: dbOk ? 200 : 503, headers: { "cache-control": "no-store" } });
}
