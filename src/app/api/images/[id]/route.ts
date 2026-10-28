import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { apiUser } from "@/lib/auth";
import { paths } from "@/lib/storage";

export async function GET(_: Request, ctx: RouteContext<"/api/images/[id]">) {
  const user = await apiUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const [img] = await db.select({ mime: schema.images.mime }).from(schema.images).where(eq(schema.images.id, id));
  if (!img) return new Response(null, { status: 404 });
  const body = await readFile(paths.image(id)).catch(() => null);
  if (!body) return new Response(null, { status: 404 });
  return new Response(body, {
    headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=86400, immutable", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
