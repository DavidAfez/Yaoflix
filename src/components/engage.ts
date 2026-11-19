"use client";

type Feature = "welcome" | "pick" | "near" | "trophy";

/** Counts what a nudge showed or what the member did with it. Fire and forget. */
export function engage(feature: Feature, action: "shown" | "click", key?: string | null) {
  try {
    const body = JSON.stringify({ feature, action, key: key ?? null });
    if (!navigator.sendBeacon?.("/api/engage", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/engage", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {}
}

/** "shown" once a day per nudge and key, so a refresh doesn't inflate the count. */
export function engageShownOnce(feature: Feature, key?: string | null) {
  const k = `gf:seen:${feature}:${key ?? ""}:${new Date().toISOString().slice(0, 10)}`;
  try {
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, "1");
  } catch {}
  engage(feature, "shown", key);
}
