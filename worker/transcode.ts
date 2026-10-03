import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Rendition, Track } from "@/db/schema";
import { paths } from "@/lib/storage";
import { fulfillTitle } from "@/lib/access";

/**
 * Adaptive bitrate ladder. Every rung shares the same 4s keyframe grid so the player
 * can switch quality on any segment boundary without a glitch.
 */
const LADDER = [
  { height: 360, kbps: 800 },
  { height: 480, kbps: 1400 },
  { height: 720, kbps: 2800 },
  { height: 1080, kbps: 5000 },
  { height: 2160, kbps: 14000 },
];
const SEGMENT_SEC = 4;
const TEXT_SUBS = new Set(["subrip", "ass", "ssa", "mov_text", "webvtt", "text"]);

type Probe = {
  streams: {
    index: number;
    codec_type: string;
    codec_name: string;
    height?: number;
    tags?: { language?: string; title?: string };
  }[];
  format: { duration?: string };
};

function run(cmd: string, args: string[], onStdout?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (b: Buffer) => {
      const s = b.toString();
      out += s.length < 1e6 ? s : "";
      if (onStdout) s.split("\n").forEach(onStdout);
    });
    p.stderr.on("data", (b: Buffer) => {
      err = (err + b.toString()).slice(-4000);
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-1500)}`))));
  });
}

const LANG: Record<string, string> = { fre: "VF", fra: "VF", fr: "VF", eng: "EN", en: "EN", spa: "ES", jpn: "JP", ger: "DE", deu: "DE", ita: "IT", kor: "KR" };
const langLabel = (code: string | undefined, i: number) => (code && LANG[code]) || (code ? code.toUpperCase() : `Piste ${i + 1}`);
const langCode = (code: string | undefined) => (code === "fra" ? "fre" : code) || "und";

export async function transcode(mediaId: string) {
  const [m] = await db.select().from(schema.media).where(eq(schema.media.id, mediaId));
  if (!m) throw new Error(`Media ${mediaId} not found`);
  await db.update(schema.media).set({ status: "PROCESSING", progress: 0, error: null }).where(eq(schema.media.id, mediaId));

  const src = paths.source(mediaId);
  const out = paths.hlsDir(mediaId);
  await mkdir(out, { recursive: true });
  // Keep subtitles uploaded by staff, wipe any previous rendition
  for (const entry of await readdir(out)) {
    if (entry !== "subs") await rm(path.join(out, entry), { recursive: true, force: true });
  }

  const probe = JSON.parse(
    await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", src]),
  ) as Probe;
  const video = probe.streams.find((s) => s.codec_type === "video" && s.height);
  if (!video?.height) throw new Error("No video stream");
  const audios = probe.streams.filter((s) => s.codec_type === "audio").slice(0, 4);
  const subs = probe.streams.filter((s) => s.codec_type === "subtitle" && TEXT_SUBS.has(s.codec_name));
  const duration = Number(probe.format.duration ?? 0);

  let ladder = LADDER.filter((r) => r.height <= video.height! + 16);
  if (!ladder.length) ladder = [{ height: video.height - (video.height % 2), kbps: 600 }];

  const preset = process.env.FFMPEG_PRESET ?? "veryfast";
  const args = ["-y", "-hide_banner", "-nostats", "-progress", "pipe:1", "-i", src];
  const split = ladder.map((_, i) => `[v${i}]`).join("");
  const scales = ladder.map((r, i) => `[v${i}]scale=-2:${r.height}:flags=lanczos,format=yuv420p[vo${i}]`).join(";");
  args.push("-filter_complex", `[0:v:0]split=${ladder.length}${split};${scales}`);

  ladder.forEach((r, i) => {
    args.push(
      "-map", `[vo${i}]`,
      `-c:v:${i}`, "libx264",
      `-b:v:${i}`, `${r.kbps}k`,
      `-maxrate:v:${i}`, `${Math.round(r.kbps * 1.1)}k`,
      `-bufsize:v:${i}`, `${Math.round(r.kbps * 1.5)}k`,
    );
  });
  audios.forEach((_, j) => {
    args.push("-map", `0:a:${j}`, `-c:a:${j}`, "aac", `-b:a:${j}`, "128k", `-ac:a:${j}`, "2");
  });
  args.push(
    "-preset", preset,
    "-profile:v", "high",
    "-sc_threshold", "0",
    "-force_key_frames", `expr:gte(t,n_forced*${SEGMENT_SEC})`,
    "-f", "hls",
    "-hls_time", String(SEGMENT_SEC),
    "-hls_playlist_type", "vod",
    "-hls_flags", "independent_segments",
    "-hls_segment_type", "mpegts",
    "-master_pl_name", "master.m3u8",
    "-hls_segment_filename", path.join(out, "s%v", "%05d.ts"),
  );

  const vMap = ladder.map((_, i) => (audios.length ? `v:${i},agroup:aud` : `v:${i}`));
  const aMap = audios.map(
    (a, j) =>
      `a:${j},agroup:aud,language:${langCode(a.tags?.language)}${j === 0 ? ",default:yes" : ""}`,
  );
  args.push("-var_stream_map", [...vMap, ...aMap].join(" "), path.join(out, "s%v", "index.m3u8"));

  let last = 0;
  await run("ffmpeg", args, (line) => {
    const m = /^out_time_us=(\d+)/.exec(line);
    if (!m || !duration) return;
    const pct = Math.min(99, Math.floor(Number(m[1]) / 1e6 / duration * 100));
    if (Date.now() - last > 4000) {
      last = Date.now();
      void db.update(schema.media).set({ progress: pct }).where(eq(schema.media.id, mediaId));
    }
  });

  // ffmpeg names audio renditions "audio_<index>": give players a readable label
  if (audios.length) {
    const master = path.join(out, "master.m3u8");
    let text = await readFile(master, "utf8");
    audios.forEach((a, j) => {
      text = text.replace(`NAME="audio_${ladder.length + j}"`, `NAME="${langLabel(a.tags?.language, j)}"`);
    });
    await writeFile(master, text);
  }

  // Embedded text subtitles become WebVTT side files
  const subtitles: Track[] = (m.subtitles ?? []).filter((t) => t.file && !t.file.includes("-emb"));
  if (subs.length) await mkdir(path.join(out, "subs"), { recursive: true });
  for (const [k, s] of subs.entries()) {
    const lang = s.tags?.language ?? `s${k}`;
    const file = `subs/${lang}-emb${k}.vtt`;
    try {
      await run("ffmpeg", ["-y", "-v", "error", "-i", src, "-map", `0:s:${k}`, "-f", "webvtt", path.join(out, file)]);
      subtitles.push({ lang, label: langLabel(s.tags?.language, k), file });
    } catch {
      // Unsupported subtitle stream: skip it, video is still fine
    }
  }

  const renditions: Rendition[] = ladder.map((r) => ({ height: r.height, bandwidth: r.kbps * 1000 }));
  const audioTracks: Track[] = audios.map((a, j) => ({ lang: langCode(a.tags?.language), label: langLabel(a.tags?.language, j) }));
  await writeFile(path.join(out, "ready"), new Date().toISOString());

  await db
    .update(schema.media)
    .set({
      status: "READY",
      progress: 100,
      durationSec: Math.round(duration),
      renditions,
      audioTracks,
      subtitles,
      readyAt: new Date(),
    })
    .where(eq(schema.media.id, mediaId));

  if (!process.env.KEEP_SOURCES) await rm(src, { force: true });
  await fulfillTitle(mediaId, m.titleId);
}
