import { NextResponse } from "next/server";
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
  const rows = await searchTitles(q);
  const ready = await readyTitleIds(rows.map((r) => r.id));
  return NextResponse.json({ results: rows.map((r) => toPoster(r, ready.has(r.id))) });
}
