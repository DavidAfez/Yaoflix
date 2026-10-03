import type { Instrumentation } from "next";

/** Every server error lands in the studio backlog. Query strings are dropped: they can hold private tokens. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logError } = await import("./lib/errors");
  const path = request.path.split("?")[0].replace(/\/w\/[^/]+/, "/w/:key").replace(/\/(verify|reset)\/[^/]+/, "/$1/:token");
  await logError("server", err, {
    path,
    method: request.method,
    route: context.routePath,
    kind: context.routeType,
    digest: typeof err === "object" && err && "digest" in err ? String(err.digest) : undefined,
  });
};
