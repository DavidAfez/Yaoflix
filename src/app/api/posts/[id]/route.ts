import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { thread } from "@/lib/feed";

/** One post, as the feed shows it (used to preview posts shared in messages). */
export async function GET(_: Request, ctx: RouteContext<"/api/posts/[id]">) {
  const user = await apiUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ post: null }, { status: 404 });
  const t = await thread(user.id, id);
  return NextResponse.json({ post: t?.post ?? null });
}
