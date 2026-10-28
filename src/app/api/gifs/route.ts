import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

/** GIF search through Tenor. The key stays on the server; without TENOR_KEY the picker is hidden. */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "auth" }, { status: 401 });
  const key = process.env.TENOR_KEY;
  if (!key) return NextResponse.json({ enabled: false, results: [] });
  if (!rateLimit(`gif:${user.id}`, 30, 30)) return NextResponse.json({ enabled: true, results: [] }, { status: 429 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  const url = new URL(q ? "https://tenor.googleapis.com/v2/search" : "https://tenor.googleapis.com/v2/featured");
  url.searchParams.set("key", key);
  url.searchParams.set("limit", "24");
  url.searchParams.set("media_filter", "tinygif,gif");
  url.searchParams.set("contentfilter", "medium");
  url.searchParams.set("locale", "fr_FR");
  if (q) url.searchParams.set("q", q);
  try {
    const res = await fetch(url, { next: { revalidate: 600 } });
    const data = (await res.json()) as { results: { id: string; media_formats: Record<string, { url: string; dims: [number, number] }> }[] };
    return NextResponse.json({
      enabled: true,
      results: data.results.map((r) => ({ id: r.id, preview: r.media_formats.tinygif?.url, url: r.media_formats.gif?.url ?? r.media_formats.tinygif?.url, w: r.media_formats.gif?.dims[0] ?? 0, h: r.media_formats.gif?.dims[1] ?? 0 })),
    });
  } catch {
    return NextResponse.json({ enabled: true, results: [] });
  }
}
