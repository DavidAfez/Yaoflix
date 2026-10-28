"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* Minimal typings for the Google Cast sender framework, loaded on demand from gstatic */
type CastSession = { getCastDevice(): { friendlyName: string }; loadMedia(r: unknown): Promise<unknown> };
type CastCtx = {
  setOptions(o: unknown): void;
  requestSession(): Promise<unknown>;
  getCurrentSession(): CastSession | null;
  endCurrentSession(stop: boolean): void;
  addEventListener(type: string, fn: (e: { sessionState: string }) => void): void;
};
type W = Window & {
  __onGCastApiAvailable?: (ok: boolean) => void;
  cast?: { framework: { CastContext: { getInstance(): CastCtx }; CastContextEventType: { SESSION_STATE_CHANGED: string }; RemotePlayer: new () => { isPaused: boolean }; RemotePlayerController: new (p: unknown) => { playOrPause(): void } } };
  chrome?: { cast?: { media: { DEFAULT_MEDIA_RECEIVER_APP_ID: string; MediaInfo: new (url: string, type: string) => Record<string, unknown>; GenericMediaMetadata: new () => Record<string, unknown>; LoadRequest: new (m: unknown) => Record<string, unknown>; HlsSegmentFormat: { TS: string }; HlsVideoSegmentFormat: { MPEG2_TS: string } }; AutoJoinPolicy: { ORIGIN_SCOPED: string } } };
  WebKitPlaybackTargetAvailabilityEvent?: unknown;
};

let loading: Promise<boolean> | null = null;
function loadCast(): Promise<boolean> {
  const w = window as W;
  if (w.cast?.framework) return Promise.resolve(true);
  // Only Chromium browsers can talk to a Chromecast
  if (!/Chrome|CriOS|Edg/.test(navigator.userAgent)) return Promise.resolve(false);
  loading ??= new Promise((resolve) => {
    w.__onGCastApiAvailable = (ok) => resolve(ok);
    const s = document.createElement("script");
    s.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
    s.async = true;
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
    setTimeout(() => resolve(Boolean(w.cast?.framework)), 8000);
  });
  return loading;
}

async function signedUrl(grantId: string) {
  const r = await fetch("/api/cast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grantId }) });
  if (!r.ok) throw new Error("cast url");
  return ((await r.json()) as { url: string }).url;
}

/**
 * Chromecast (Chrome, Edge, Android) through the Cast framework, AirPlay (Safari) through the
 * native picker. The TV pulls a signed URL, never the member's session.
 */
export function useCast({ grantId, title, poster, video }: { grantId: string; title: string; poster: string | null; video: React.RefObject<HTMLVideoElement | null> }) {
  const [chromecast, setChromecast] = useState(false);
  const [airplay, setAirplay] = useState(false);
  const [device, setDevice] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const controller = useRef<{ playOrPause(): void } | null>(null);

  useEffect(() => {
    const w = window as W;
    let alive = true;
    void loadCast().then((ok) => {
      if (!ok || !alive || !w.cast || !w.chrome?.cast) return;
      const ctx = w.cast.framework.CastContext.getInstance();
      ctx.setOptions({ receiverApplicationId: w.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID, autoJoinPolicy: w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED });
      ctx.addEventListener(w.cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (e) => {
        if (e.sessionState === "SESSION_ENDED") setDevice(null);
      });
      const player = new w.cast.framework.RemotePlayer();
      controller.current = new w.cast.framework.RemotePlayerController(player);
      setChromecast(true);
    });
    if (w.WebKitPlaybackTargetAvailabilityEvent && video.current) {
      const v = video.current;
      const on = (e: Event) => setAirplay((e as Event & { availability: string }).availability === "available");
      v.addEventListener("webkitplaybacktargetavailabilitychanged", on);
      return () => {
        alive = false;
        v.removeEventListener("webkitplaybacktargetavailabilitychanged", on);
      };
    }
    return () => {
      alive = false;
    };
  }, [video]);

  const startChromecast = useCallback(async () => {
    const w = window as W;
    if (!w.cast || !w.chrome?.cast) return;
    const ctx = w.cast.framework.CastContext.getInstance();
    await ctx.requestSession().catch(() => null);
    const session = ctx.getCurrentSession();
    if (!session) return;
    const m = w.chrome.cast.media;
    const info = new m.MediaInfo(await signedUrl(grantId), "application/x-mpegurl");
    info.hlsSegmentFormat = m.HlsSegmentFormat.TS;
    info.hlsVideoSegmentFormat = m.HlsVideoSegmentFormat.MPEG2_TS;
    info.streamType = "BUFFERED";
    const meta = new m.GenericMediaMetadata();
    meta.title = title;
    if (poster) meta.images = [{ url: poster }];
    info.metadata = meta;
    const req = new m.LoadRequest(info);
    req.currentTime = video.current?.currentTime ?? 0;
    req.autoplay = true;
    video.current?.pause();
    await session.loadMedia(req);
    setDevice(session.getCastDevice().friendlyName);
    setPaused(false);
  }, [grantId, title, poster, video]);

  const stop = useCallback(() => {
    const w = window as W;
    w.cast?.framework.CastContext.getInstance().endCurrentSession(true);
    setDevice(null);
  }, []);

  const toggle = useCallback(() => {
    controller.current?.playOrPause();
    setPaused((p) => !p);
  }, []);

  const showAirplay = useCallback(() => {
    (video.current as HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void })?.webkitShowPlaybackTargetPicker?.();
  }, [video]);

  return { chromecast, airplay, device, paused, startChromecast, stop, toggle, showAirplay, signedUrl };
}
