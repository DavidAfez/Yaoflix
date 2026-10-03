"use client";
import { useEffect, useMemo, useRef } from "react";

const BEAT_SEC = 15;

function send(body: Record<string, unknown>, beacon = false) {
  const json = JSON.stringify(body);
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/watch", json);
    return Promise.resolve(null);
  }
  return fetch("/api/watch", { method: "POST", body: json, headers: { "content-type": "application/json" }, keepalive: true })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

/**
 * Focus metric: a "span" is continuous playback between two pauses.
 * Watch time is counted on the wall clock while the video actually plays.
 */
export function useTelemetry(grantKey: string, video: React.RefObject<HTMLVideoElement | null>) {
  const ws = useRef<string | null>(null);
  const spanStart = useRef<number | null>(null);
  const lastBeat = useRef<number | null>(null);
  const ended = useRef(false);

  useEffect(() => {
    let alive = true;
    void send({ action: "start", grant: grantKey }).then((r: { ws?: string } | null) => {
      if (alive && r?.ws) ws.current = r.ws;
    });

    const beat = (beacon = false) => {
      if (!ws.current || lastBeat.current == null) return;
      const now = performance.now();
      const played = (now - lastBeat.current) / 1000;
      lastBeat.current = now;
      void send({ action: "beat", ws: ws.current, pos: video.current?.currentTime ?? 0, played }, beacon);
    };
    const timer = setInterval(() => beat(), BEAT_SEC * 1000);

    const leave = () => {
      if (!ws.current) return;
      if (spanStart.current != null) {
        const seconds = (performance.now() - spanStart.current) / 1000;
        spanStart.current = null;
        void send({ action: "span", ws: ws.current, seconds, endedBy: "leave", pos: video.current?.currentTime ?? 0 }, true);
      }
      beat(true);
      lastBeat.current = null;
    };
    const onVis = () => document.visibilityState === "hidden" && video.current?.paused === false && leave();
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      leave();
      clearInterval(timer);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [grantKey, video]);

  return useMemo(
    () => ({
      playing() {
        const now = performance.now();
        if (spanStart.current == null) spanStart.current = now;
        if (lastBeat.current == null) lastBeat.current = now;
      },
      paused(endedBy: "pause" | "end") {
        const now = performance.now();
        if (ws.current && spanStart.current != null) {
          const seconds = (now - spanStart.current) / 1000;
          void send({ action: "span", ws: ws.current, seconds, endedBy, pos: video.current?.currentTime ?? 0 });
        }
        if (ws.current && lastBeat.current != null) {
          void send({ action: "beat", ws: ws.current, pos: video.current?.currentTime ?? 0, played: (now - lastBeat.current) / 1000 });
        }
        spanStart.current = null;
        lastBeat.current = null;
      },
      end() {
        if (ended.current || !ws.current) return;
        ended.current = true;
        void send({ action: "end", ws: ws.current });
      },
    }),
    [video],
  );
}
