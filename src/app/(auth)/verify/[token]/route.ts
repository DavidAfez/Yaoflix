import { NextResponse } from "next/server";
import { verifyEmail } from "../../actions";

// A route handler (not a page) because it sets the session cookie
export async function GET(req: Request, ctx: RouteContext<"/verify/[token]">) {
  const { token } = await ctx.params;
  const ok = await verifyEmail(token);
  return NextResponse.redirect(new URL(ok ? "/" : "/login?expired=1", req.url));
}
