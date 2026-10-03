import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { logError } from "@/lib/errors";
import { rateLimit } from "@/lib/ratelimit";

/** Browser and player errors land in the backlog. Only signed-in users can report, to limit spam. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user || !rateLimit(`err:${user.id}`, 20, 60)) return new NextResponse(null, { status: 204 });
  try {
    const { source, message, context } = JSON.parse(await req.text()) as {
      source?: string;
      message?: string;
      context?: Record<string, unknown>;
    };
    if (!message) return new NextResponse(null, { status: 204 });
    const err = new Error(String(message).slice(0, 1000));
    err.stack = typeof context?.stack === "string" ? context.stack : `${err.message}\n    at ${context?.path ?? "client"}`;
    await logError(source === "player" ? "player" : "client", err, { ...context, stack: undefined, role: user.role });
  } catch {}
  return new NextResponse(null, { status: 204 });
}
