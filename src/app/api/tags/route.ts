import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { suggestTags } from "@/lib/feed";
import { rateLimit } from "@/lib/ratelimit";

/** Hashtags already in use that start with what the member is typing. */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user || !rateLimit(`tags:${user.id}`, 60, 60)) return NextResponse.json({ tags: [] }, { status: user ? 429 : 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 40);
  return NextResponse.json({ tags: q ? await suggestTags(q) : [] });
}
