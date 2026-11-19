"use client";
import type { Track } from "@/db/schema";
import { useT } from "../i18n";
import { MenuItem, qLabel } from "./controls";
import type { AudioOpt, Level } from "./use-hls";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** The player's two menus: speed and quality, or audio tracks and subtitles. */
export function PlayerMenu({
  menu,
  speed,
  onSpeed,
  levels,
  level,
  autoHeight,
  onLevel,
  audios,
  audio,
  onAudio,
  subtitles,
  sub,
  onSub,
}: {
  menu: "quality" | "tracks";
  speed: number;
  onSpeed: (x: number) => void;
  levels: Level[];
  level: number;
  autoHeight: number | null;
  onLevel: (i: number) => void;
  audios: AudioOpt[];
  audio: number;
  onAudio: (i: number) => void;
  subtitles: Track[];
  sub: number;
  onSub: (i: number) => void;
}) {
  const t = useT();
  return menu === "quality" ? (
    <>
      <p className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-dim">{t("Vitesse")}</p>
      <div className="flex flex-wrap gap-1 px-3 pb-2">
        {SPEEDS.map((x) => (
          <button key={x} onClick={() => onSpeed(x)} className={`px-2 py-1 font-mono text-xs transition-colors ${speed === x ? "bg-lime text-ink" : "text-bone hover:bg-bone/10"}`}>
            {x}×
          </button>
        ))}
      </div>
      {levels.length > 1 && <p className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-dim">{t("Qualité")}</p>}
      {levels.length > 1 && (
        <MenuItem on={level === -1} onClick={() => onLevel(-1)}>
          Auto {level === -1 && autoHeight ? <span className="font-mono text-xs text-dim">{qLabel(autoHeight)}</span> : null}
        </MenuItem>
      )}
      {levels.length > 1 &&
        levels.map((l) => (
          <MenuItem key={l.index} on={level === l.index} onClick={() => onLevel(l.index)}>
            {qLabel(l.height)}
          </MenuItem>
        ))}
    </>
  ) : (
    <>
      {audios.length > 1 &&
        audios.map((a) => (
          <MenuItem key={`a${a.index}`} on={audio === a.index} onClick={() => onAudio(a.index)}>
            {a.label}
          </MenuItem>
        ))}
      {subtitles.length > 0 && (
        <>
          {audios.length > 1 && <div className="my-2 h-px bg-line" />}
          <MenuItem on={sub === -1} onClick={() => onSub(-1)}>
            {t("Sans ST")}
          </MenuItem>
          {subtitles.map((s, i) => (
            <MenuItem key={`s${i}`} on={sub === i} onClick={() => onSub(i)}>
              ST {s.label}
            </MenuItem>
          ))}
        </>
      )}
    </>
  );
}
