"use client";
import { useEffect } from "react";

const BEAT_MS = 20_000;

/** Counts visible time on the platform. Hidden tabs do not count. */
export function Presence() {
  useEffect(() => {
    let sid: string | null = null;
    try {
      sid = sessionStorage.getItem("yf_ps");
    } catch {}
    let last = Date.now();

    const beat = async (final = false) => {
      const now = Date.now();
      const visibleSec = document.visibilityState === "visible" || final ? Math.round((now - last) / 1000) : 0;
      last = now;
      const body = JSON.stringify({ sid, sec: Math.min(visibleSec, 60) });
      if (final) {
        navigator.sendBeacon("/api/presence", body);
        return;
      }
      try {
        const res = await fetch("/api/presence", { method: "POST", body, headers: { "content-type": "application/json" } });
        if (res.ok) {
          const data = (await res.json()) as { sid: string };
          sid = data.sid;
          try {
            sessionStorage.setItem("yf_ps", sid);
          } catch {}
        }
      } catch {}
    };

    void beat();
    const timer = setInterval(() => void beat(), BEAT_MS);
    const onVis = () => {
      if (document.visibilityState === "hidden") void beat(true);
      else last = Date.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return null;
}
