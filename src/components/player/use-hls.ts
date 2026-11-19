"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import type Hls from "hls.js";
import type { ErrorData } from "hls.js";
import { report } from "../error-reporter";
import type { RequestPrefs } from "@/db/schema";

export type Level = { index: number; height: number };
export type AudioOpt = { index: number; label: string; lang: string };

/**
 * The streaming engine: hls.js with network retries, media error recovery and a full rebuild
 * as a last resort; native HLS where hls.js can't run (old iOS). Gives the player what it shows
 * in its menus (qualities, audio tracks) and whether playback failed for good.
 */
export function useHlsEngine({
  video,
  src,
  grantId,
  resumeAt,
  prefs,
  signed,
}: {
  video: RefObject<HTMLVideoElement | null>;
  src: string;
  grantId: string;
  resumeAt: number;
  prefs: RequestPrefs | null;
  signed: (grantId: string) => Promise<string>;
}) {
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [autoHeight, setAutoHeight] = useState<number | null>(null);
  const [audios, setAudios] = useState<AudioOpt[]>([]);
  const [audio, setAudio] = useState(0);
  const [fatal, setFatal] = useState(false);

  useEffect(() => {
    const v = video.current!;
    let destroyed = false;
    let netRetries = 0;
    let mediaRecoveries = 0;
    let lastMediaRecovery = 0;

    const startAt = resumeAt > 30 ? resumeAt : 0;

    async function boot(position: number) {
      const { default: HlsCtor } = await import("hls.js");
      if (destroyed) return;

      if (!HlsCtor.isSupported()) {
        // iOS Safari before Managed Media Source: native HLS is the most reliable path.
        // The signed URL needs no cookie, so AirPlay can hand it to the TV as is.
        const url = await signed(grantId).then((u) => new URL(u).pathname, () => src);
        if (destroyed) return;
        v.src = url;
        v.addEventListener("loadedmetadata", () => position && (v.currentTime = position), { once: true });
        return;
      }

      const hls = new HlsCtor({
        enableWorker: true,
        startLevel: -1,
        capLevelToPlayerSize: true,
        maxBufferLength: 40,
        maxMaxBufferLength: 120,
        backBufferLength: 30,
        maxBufferHole: 0.5,
        nudgeMaxRetry: 8,
        abrEwmaDefaultEstimate: 2_000_000,
        abrBandWidthUpFactor: 0.6,
        startFragPrefetch: true,
        startPosition: position || -1,
        fragLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 10_000,
            maxLoadTimeMs: 60_000,
            timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
            errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000, backoff: "exponential" },
          },
        },
      });
      hlsRef.current = hls;
      hls.attachMedia(v);
      hls.loadSource(src);

      hls.on(HlsCtor.Events.MANIFEST_PARSED, (_, data) => {
        const lv = data.levels.map((l, index) => ({ index, height: l.height })).sort((a, b) => b.height - a.height);
        setLevels(lv);
        // The quality asked at request time becomes the ceiling, the user can still switch
        if (prefs && prefs.quality !== "auto") {
          const cap = Number(prefs.quality);
          const allowed = data.levels.map((l, i) => ({ i, h: l.height })).filter((l) => l.h <= cap + 16);
          if (allowed.length) hls.autoLevelCapping = allowed.sort((a, b) => b.h - a.h)[0].i;
        }
      });
      hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_, d) => setAutoHeight(hls.levels[d.level]?.height ?? null));
      hls.on(HlsCtor.Events.AUDIO_TRACKS_UPDATED, (_, d) => {
        const opts = d.audioTracks.map((t, index) => ({ index, label: t.name || t.lang || `Piste ${index + 1}`, lang: t.lang ?? "" }));
        setAudios(opts);
        if (prefs?.audio === "vf") {
          const fr = opts.find((o) => /^(fr|fre|fra)/i.test(o.lang) || o.label === "VF");
          if (fr) hls.audioTrack = fr.index;
        } else if (prefs?.audio === "vo") {
          const vo = opts.find((o) => !/^(fr|fre|fra)/i.test(o.lang) && o.label !== "VF");
          if (vo) hls.audioTrack = vo.index;
        }
        setAudio(hls.audioTrack);
      });
      hls.on(HlsCtor.Events.FRAG_LOADED, () => {
        netRetries = 0;
      });

      hls.on(HlsCtor.Events.ERROR, (_, data: ErrorData) => {
        if (!data.fatal) return;
        report("player", `${data.type}:${data.details}`, { grant: grantId, level: hls.currentLevel, t: v.currentTime });
        if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && netRetries < 6) {
          netRetries++;
          setTimeout(() => hls.startLoad(v.currentTime), Math.min(8000, 500 * 2 ** netRetries));
          return;
        }
        if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 3) {
          const now = Date.now();
          if (now - lastMediaRecovery < 3000) hls.swapAudioCodec();
          lastMediaRecovery = now;
          mediaRecoveries++;
          hls.recoverMediaError();
          return;
        }
        // Last resort: rebuild the whole pipeline where we were
        const at = v.currentTime;
        hls.destroy();
        hlsRef.current = null;
        if (!destroyed && mediaRecoveries < 5) {
          mediaRecoveries++;
          void boot(at);
        } else setFatal(true);
      });
    }

    void boot(startAt);
    return () => {
      destroyed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [video, src, grantId, resumeAt, prefs, signed]);

  return { hlsRef, levels, autoHeight, audios, audio, setAudio, fatal };
}
