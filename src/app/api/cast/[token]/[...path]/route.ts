import { castMedia } from "@/lib/cast";
import { ALLOWED, paced, serveHls } from "@/lib/hls-serve";

// Cast receivers load the playlist from their own origin: they need CORS
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Range", "Access-Control-Expose-Headers": "Content-Length, Content-Range" };

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
}

export async function GET(req: Request, ctx: RouteContext<"/api/cast/[token]/[...path]">) {
  const { token, path } = await ctx.params;
  const rel = path.join("/");
  if (!ALLOWED.test(rel)) return new Response(null, { status: 404, headers: CORS });
  const mediaId = await castMedia(token);
  if (!mediaId) return new Response(null, { status: 403, headers: CORS });
  if (rel.endsWith(".ts") && !paced(`cast:${token.split(".")[0]}`)) return new Response(null, { status: 429, headers: { ...CORS, "Retry-After": "2" } });
  return serveHls(req, mediaId, rel, CORS);
}
