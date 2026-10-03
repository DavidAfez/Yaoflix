"use client";
import { useEffect } from "react";

export function report(source: "client" | "player", message: string, context: Record<string, unknown> = {}) {
  try {
    const body = JSON.stringify({ source, message: message.slice(0, 1000), context: { ...context, path: location.pathname } });
    navigator.sendBeacon("/api/errors", body);
  } catch {}
}

/** Sends uncaught browser errors to the backlog. */
export function ErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>();
    const onError = (e: ErrorEvent) => {
      if (seen.has(e.message) || seen.size > 20) return;
      seen.add(e.message);
      report("client", e.message, { stack: e.error?.stack?.slice(0, 2000), file: e.filename, line: e.lineno });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
      if (seen.has(msg) || seen.size > 20) return;
      seen.add(msg);
      report("client", msg, { stack: e.reason?.stack?.slice(0, 2000) });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
