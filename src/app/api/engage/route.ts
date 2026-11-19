import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { FEATURES, track } from "@/lib/engagement";

const Body = z.object({ feature: z.enum(FEATURES), action: z.enum(["shown", "click"]), key: z.string().max(80).nullable().optional() });

/** What a nudge showed and whether the member followed it (sent with sendBeacon). */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!rateLimit(`engage:${user.id}`, 60, 60)) return new NextResponse(null, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  await track(user.id, parsed.data.feature, parsed.data.action, parsed.data.key ?? null);
  return new NextResponse(null, { status: 204 });
}
