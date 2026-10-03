import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getTitle } from "@/lib/tmdb";

/** Staff picker: turn a TMDB reference into our local title id. */
export async function GET(req: Request) {
  const user = await apiUser(can.upload);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind");
  const tmdb = Number(sp.get("tmdb"));
  if ((kind !== "movie" && kind !== "tv") || !Number.isInteger(tmdb)) return NextResponse.json({ error: "bad" }, { status: 400 });
  const t = await getTitle(kind, tmdb);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id: t.id });
}
