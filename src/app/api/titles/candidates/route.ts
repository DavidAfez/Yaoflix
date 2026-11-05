import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { candidates } from "@/lib/candidates";
import { rateLimit } from "@/lib/ratelimit";

/** Suggestions with pictures for the "missing title" sheet. */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ items: [] }, { status: 401 });
  if (!rateLimit(`cand:${user.id}`, 30, 60)) return NextResponse.json({ items: [] }, { status: 429 });
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind");
  if (kind !== "movie" && kind !== "tv" && kind !== "album" && kind !== "book") return NextResponse.json({ items: [] }, { status: 400 });
  return NextResponse.json({ items: await candidates(kind, sp.get("q") ?? "") });
}
