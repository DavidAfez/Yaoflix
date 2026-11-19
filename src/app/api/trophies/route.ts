import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { syncTrophies, unseenTrophies } from "@/lib/trophies";

/** Awards what the member just earned and returns the trophies not celebrated yet. */
export async function GET() {
  const user = await apiUser();
  if (!user?.approved) return NextResponse.json({ ids: [] }, { status: user ? 403 : 401 });
  if (!rateLimit(`trophies:${user.id}`, 20, 60)) return NextResponse.json({ ids: [] });
  await syncTrophies(user.id, true);
  return NextResponse.json({ ids: await unseenTrophies(user.id) }, { headers: { "cache-control": "no-store" } });
}
