"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type Hls from "hls.js";
import type { ErrorData } from "hls.js";
import { ArrowLeft, Maximize, Minimize, Pause, Play, PictureInPicture2, RotateCcw, RotateCw, Volume2, VolumeX, Settings2, Captions } from "lucide-react";
import Link from "next/link";
import { report } from "../error-reporter";
import { useTelemetry } from "./telemetry";
import { EndCard } from "./end-card";
import type { RequestPrefs, Track } from "@/db/schema";

type Props = {
  grantId: string;
  grantKey: string;
  titleId: number;
  title: string;
  backdrop: string | null;
  resumeAt: number;
  prefs: RequestPrefs | null;
  subtitles: Track[];
};

type Level = { index: number; height: number };
type AudioOpt = { index: number; label: string; lang: string };

const fmt = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

const qLabel = (h: number) => (h >= 2000 ? "4K" : `${h}p`);

export function Player({ grantId, grantKey, titleId, title, backdrop, resumeAt, prefs, subtitles }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTap = useRef<{ t: number; x: number }>({ t: 0, x: 0 });

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [ui, setUi] = useState(true);
  const [full, setFull] = useState(false);
  const [menu, setMenu] = useState<null | "quality" | "tracks">(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [level, setLevel] = useState(-1);
  const [autoHeight, setAutoHeight] = useState<number | null>(null);
  const [audios, setAudios] = useState<AudioOpt[]>([]);
  const [audio, setAudio] = useState(0);
  const [sub, setSub] = useState(-1);
  const [ripple, setRipple] = useState<null | { side: "l" | "r"; k: number }>(null);
  const [fatal, setFatal] = useState(false);
  const [ended, setEnded] = useState(false);

  const src = `/api/stream/${grantId}/master.m3u8`;
  const tele = useTelemetry(grantKey, video);

  const poke = useCallback(() => {
    setUi(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!video.current?.paused) {
        setUi(false);
        setMenu(null);
      }
    }, 2800);
  }, []);

  // ---- Engine -------------------------------------------------------------
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
        // iOS Safari before Managed Media Source: native HLS is the most reliable path
        v.src = src;
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
  }, [src, grantId, resumeAt, prefs]);

  // Stall watchdog: if we sit in "waiting" with data around, nudge the playhead
  useEffect(() => {
    if (!waiting || !playing) return;
    const t = setTimeout(() => {
      const v = video.current;
      if (!v || v.paused) return;
      const hls = hlsRef.current;
      if (hls) hls.startLoad(v.currentTime);
      v.currentTime = v.currentTime + 0.05;
      report("player", "stall-nudge", { grant: grantId, t: v.currentTime });
    }, 7000);
    return () => clearTimeout(t);
  }, [waiting, playing, grantId]);

  // ---- Video events -------------------------------------------------------
  useEffect(() => {
    const v = video.current!;
    const onTime = () => {
      setTime(v.currentTime);
      if (v.buffered.length) {
        for (let i = 0; i < v.buffered.length; i++) {
          if (v.buffered.start(i) <= v.currentTime + 0.5 && v.buffered.end(i) >= v.currentTime) setBuffered(v.buffered.end(i));
        }
      }
      // Credits: treat the last 3% (min 60s) as the end for the feedback prompt
      if (v.duration && v.currentTime > v.duration - Math.max(60, v.duration * 0.03) && !ended) {
        setEnded(true);
        tele.end();
      }
    };
    const onPlay = () => {
      setPlaying(true);
      tele.playing();
    };
    const onPause = () => {
      setPlaying(false);
      setUi(true);
      if (!v.ended && !v.seeking) tele.paused("pause");
    };
    const onEnded = () => {
      setEnded(true);
      tele.paused("end");
      tele.end();
    };
    const onWait = () => setWaiting(true);
    const onReady = () => setWaiting(false);
    const onMeta = () => setDuration(v.duration);
    const onVol = () => setMuted(v.muted);
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    const onErr = () => v.error && report("player", `video:${v.error.code}:${v.error.message}`, { grant: grantId });

    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("playing", onReady);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("waiting", onWait);
    v.addEventListener("canplay", onReady);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onMeta);
    v.addEventListener("volumechange", onVol);
    v.addEventListener("error", onErr);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("playing", onReady);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("waiting", onWait);
      v.removeEventListener("canplay", onReady);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onMeta);
      v.removeEventListener("volumechange", onVol);
      v.removeEventListener("error", onErr);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [tele, grantId, ended]);

  // Default subtitle from the request preferences
  useEffect(() => {
    if (!prefs || prefs.subs === "none") return;
    const i = subtitles.findIndex((s) => s.lang.startsWith(prefs.subs) || (prefs.subs === "fr" && /^(fre|fra)/.test(s.lang)) || (prefs.subs === "en" && s.lang === "eng"));
    if (i >= 0) setSub(i);
  }, [prefs, subtitles]);

  useEffect(() => {
    const tracks = video.current?.textTracks;
    if (!tracks) return;
    for (let i = 0; i < tracks.length; i++) tracks[i].mode = i === sub ? "showing" : "disabled";
  }, [sub]);

  // ---- Actions ------------------------------------------------------------
  const toggle = useCallback(() => {
    const v = video.current!;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const seek = useCallback((delta: number) => {
    const v = video.current!;
    v.currentTime = Math.max(0, Math.min((v.duration || 0) - 1, v.currentTime + delta));
    poke();
  }, [poke]);

  const toggleFull = useCallback(async () => {
    const v = video.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (box.current?.requestFullscreen) {
      await box.current.requestFullscreen().catch(() => {});
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await o.lock?.("landscape").catch(() => {});
    } else v.webkitEnterFullscreen?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const v = video.current!;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          toggle();
          break;
        case "ArrowLeft":
        case "j":
          seek(-10);
          break;
        case "ArrowRight":
        case "l":
          seek(10);
          break;
        case "ArrowUp":
          v.volume = Math.min(1, v.volume + 0.1);
          break;
        case "ArrowDown":
          v.volume = Math.max(0, v.volume - 0.1);
          break;
        case "f":
          void toggleFull();
          break;
        case "m":
          v.muted = !v.muted;
          break;
      }
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, seek, toggleFull, poke]);

  // Tap: show/hide controls. Double tap on a side: seek 10s.
  const onSurface = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      toggle();
      return;
    }
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (now - lastTap.current.t < 300) {
      if (x < 0.4) {
        seek(-10);
        setRipple({ side: "l", k: now });
      } else if (x > 0.6) {
        seek(10);
        setRipple({ side: "r", k: now });
      }
      lastTap.current = { t: 0, x };
      return;
    }
    lastTap.current = { t: now, x };
    setTimeout(() => {
      if (lastTap.current.t === now) {
        if (ui) setUi(false);
        else poke();
      }
    }, 260);
  };

  const pickLevel = (i: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    if (i === -1) hls.autoLevelCapping = -1;
    hls.currentLevel = i;
    setLevel(i);
    setMenu(null);
  };

  const pickAudio = (i: number) => {
    if (hlsRef.current) hlsRef.current.audioTrack = i;
    setAudio(i);
  };

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.current!.currentTime = ratio * (duration || 0);
    poke();
  };

  const pct = duration ? (time / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={box}
      className={`relative h-dvh w-full overflow-hidden bg-black ${ui ? "" : "cursor-none"}`}
      onPointerMove={(e) => e.pointerType === "mouse" && poke()}
    >
      <video
        ref={video}
        className="absolute inset-0 size-full"
        playsInline
        preload="auto"
        poster={backdrop ?? undefined}
        autoPlay
      >
        {subtitles.map((s, i) => (
          <track key={s.file ?? i} kind="subtitles" src={`/api/stream/${grantId}/${s.file}`} srcLang={s.lang.slice(0, 2)} label={s.label} />
        ))}
      </video>

      <div className="absolute inset-0" onPointerUp={onSurface} />

      <AnimatePresence>
        {ripple && (
          <motion.div
            key={ripple.k}
            initial={{ opacity: 0.5, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.4 }}
            transition={{ duration: 0.6 }}
            onAnimationComplete={() => setRipple(null)}
            className={`pointer-events-none absolute top-1/2 grid size-40 -translate-y-1/2 place-items-center rounded-full bg-bone/15 ${ripple.side === "l" ? "left-[10%]" : "right-[10%]"}`}
          >
            {ripple.side === "l" ? <RotateCcw size={36} /> : <RotateCw size={36} />}
          </motion.div>
        )}
      </AnimatePresence>

      {waiting && !fatal && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <motion.div
            className="size-14 border-2 border-lime border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
          />
        </div>
      )}

      {fatal && (
        <div className="absolute inset-0 grid place-items-center bg-ink/90">
          <button onClick={() => location.reload()} className="notch bg-lime px-8 py-4 font-semibold text-ink">
            Relancer
          </button>
        </div>
      )}

      <AnimatePresence>
        {ui && !ended && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/90 to-transparent" />

            <div className="pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-4 p-4 pt-[max(1rem,env(safe-area-inset-top))] md:p-8">
              <Link href="/" aria-label="Retour" className="grid size-11 place-items-center hover:text-lime">
                <ArrowLeft />
              </Link>
              <p className="truncate font-display text-lg font-semibold md:text-2xl">{title}</p>
            </div>

            <div className="pointer-events-auto absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-10 md:gap-16">
              <CtrlBtn label="-10" onClick={() => seek(-10)}>
                <RotateCcw size={30} />
              </CtrlBtn>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={toggle}
                aria-label={playing ? "Pause" : "Lecture"}
                className="grid size-20 place-items-center rounded-full bg-bone text-ink md:size-24"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={String(playing)} initial={{ scale: 0.4, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0.4, opacity: 0 }}>
                    {playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" className="translate-x-0.5" />}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
              <CtrlBtn label="+10" onClick={() => seek(10)}>
                <RotateCw size={30} />
              </CtrlBtn>
            </div>

            <div className="pointer-events-auto absolute inset-x-0 bottom-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-8 md:pb-8">
              <div className="group relative h-6 cursor-pointer touch-none" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e); }} onPointerMove={(e) => e.buttons && scrub(e)}>
                <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-bone/15 transition-all group-hover:h-1.5">
                  <div className="absolute inset-y-0 left-0 bg-bone/30" style={{ width: `${bufPct}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-lime" style={{ width: `${pct}%` }} />
                </div>
                <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 bg-lime" style={{ left: `${pct}%` }} />
              </div>
              <div className="mt-2 flex items-center gap-1 md:gap-3">
                <span className="font-mono text-xs tabular-nums text-bone/80">
                  {fmt(time)} <span className="text-bone/40">/ {fmt(duration)}</span>
                </span>
                <div className="ml-auto flex items-center">
                  <CtrlBtn label="Son" onClick={() => (video.current!.muted = !muted)}>
                    {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </CtrlBtn>
                  {(audios.length > 1 || subtitles.length > 0) && (
                    <CtrlBtn label="Pistes" on={menu === "tracks"} onClick={() => setMenu(menu === "tracks" ? null : "tracks")}>
                      <Captions size={20} />
                    </CtrlBtn>
                  )}
                  {levels.length > 1 && (
                    <CtrlBtn label="Qualité" on={menu === "quality"} onClick={() => setMenu(menu === "quality" ? null : "quality")}>
                      <Settings2 size={20} />
                    </CtrlBtn>
                  )}
                  <CtrlBtn label="PiP" onClick={() => void video.current?.requestPictureInPicture?.().catch(() => {})} className="hidden md:grid">
                    <PictureInPicture2 size={20} />
                  </CtrlBtn>
                  <CtrlBtn label="Plein écran" onClick={() => void toggleFull()}>
                    {full ? <Minimize size={20} /> : <Maximize size={20} />}
                  </CtrlBtn>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {menu && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  className="pointer-events-auto absolute bottom-24 right-4 w-56 border-l-2 border-lime bg-ink/95 py-2 backdrop-blur md:right-8"
                >
                  {menu === "quality" ? (
                    <>
                      <MenuItem on={level === -1} onClick={() => pickLevel(-1)}>
                        Auto {level === -1 && autoHeight ? <span className="font-mono text-xs text-dim">{qLabel(autoHeight)}</span> : null}
                      </MenuItem>
                      {levels.map((l) => (
                        <MenuItem key={l.index} on={level === l.index} onClick={() => pickLevel(l.index)}>
                          {qLabel(l.height)}
                        </MenuItem>
                      ))}
                    </>
                  ) : (
                    <>
                      {audios.length > 1 &&
                        audios.map((a) => (
                          <MenuItem key={`a${a.index}`} on={audio === a.index} onClick={() => pickAudio(a.index)}>
                            {a.label}
                          </MenuItem>
                        ))}
                      {subtitles.length > 0 && (
                        <>
                          {audios.length > 1 && <div className="my-2 h-px bg-line" />}
                          <MenuItem on={sub === -1} onClick={() => setSub(-1)}>
                            Sans ST
                          </MenuItem>
                          {subtitles.map((s, i) => (
                            <MenuItem key={`s${i}`} on={sub === i} onClick={() => setSub(i)}>
                              ST {s.label}
                            </MenuItem>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{ended && <EndCard titleId={titleId} title={title} onReplay={() => { setEnded(false); video.current!.currentTime = 0; void video.current!.play(); }} />}</AnimatePresence>
    </div>
  );
}

function CtrlBtn({ children, label, onClick, on, className = "" }: { children: React.ReactNode; label: string; onClick: () => void; on?: boolean; className?: string }) {
  return (
    <motion.button whileTap={{ scale: 0.85 }} onClick={onClick} aria-label={label} title={label} className={`grid size-11 place-items-center transition-colors ${on ? "text-lime" : "text-bone hover:text-lime"} ${className}`}>
      {children}
    </motion.button>
  );
}

function MenuItem({ children, on, onClick }: { children: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-bone/5 ${on ? "text-lime" : "text-bone"}`}>
      {children}
    </button>
  );
}
