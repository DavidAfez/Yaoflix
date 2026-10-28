import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { threadFor } from "@/lib/chat";
import { MEDIA_ROOT } from "@/lib/storage";

export async function GET(_: Request, ctx: RouteContext<"/api/chat/files/[id]">) {
  const user = await apiUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const [f] = await db.select({ threadId: schema.chatFiles.threadId }).from(schema.chatFiles).where(eq(schema.chatFiles.id, id));
  if (!f || !(await threadFor(user.id, f.threadId))) return new Response(null, { status: 404 });
  const body = await readFile(path.join(MEDIA_ROOT, "chat", id)).catch(() => null);
  if (!body) return new Response(null, { status: 404 });
  return new Response(body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=86400, immutable" } });
}
