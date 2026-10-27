import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { paths } from "@/lib/storage";

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (b: Buffer) => (err = (err + b.toString()).slice(-2000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err}`))));
  });
}

/** Cuts a clip (720p at most, 15 s at most) or grabs a still, from the HLS rendition closest to 720p. */
export async function renderClip(clipId: string) {
  const [c] = await db.select().from(schema.clips).where(eq(schema.clips.id, clipId));
  if (!c) return;
  const [m] = await db.select({ renditions: schema.media.renditions }).from(schema.media).where(eq(schema.media.id, c.mediaId));
  const heights = (m?.renditions ?? []).map((r) => r.height);
  // Video variants come first in the HLS output (s0, s1...), in ladder order
  let pick = 0;
  heights.forEach((h, i) => h <= 720 && (pick = i));
  const dir = paths.hlsDir(c.mediaId);
  const input = path.join(dir, `s${pick}`, "index.m3u8");
  // Audio lives in its own HLS rendition: take the default one from the master playlist
  const master = await readFile(path.join(dir, "master.m3u8"), "utf8").catch(() => "");
  const audioUri = /TYPE=AUDIO[^\n]*DEFAULT=YES[^\n]*URI="([^"]+)"/.exec(master)?.[1] ?? /TYPE=AUDIO[^\n]*URI="([^"]+)"/.exec(master)?.[1];
  const audio = audioUri && /^s\d+\/index\.m3u8$/.test(audioUri) ? path.join(dir, audioUri) : null;
  // Seeking near 0 lands before the first segment (they start a little after 0) and shortens the clip: read from the top instead
  const seek = (file: string) => (c.startSec >= 2 ? ["-ss", String(c.startSec), "-i", file] : ["-i", file]);
  await mkdir(paths.clipsDir, { recursive: true });
  const out = paths.clip(c.id, c.kind);
  try {
    if (c.kind === "image") {
      await ffmpeg(["-y", "-v", "error", ...seek(input), "-frames:v", "1", "-q:v", "3", out]);
    } else {
      const dur = Math.min(15, Math.max(1, c.durationSec));
      await ffmpeg([
        "-y", "-v", "error",
        ...seek(input),
        ...(audio ? seek(audio) : []),
        "-t", String(dur),
        "-map", "0:v:0", ...(audio ? ["-map", "1:a:0"] : []),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2",
        "-movflags", "+faststart",
        out,
      ]);
    }
    await db.update(schema.clips).set({ status: "READY" }).where(eq(schema.clips.id, c.id));
  } catch (e) {
    await db.update(schema.clips).set({ status: "FAILED" }).where(eq(schema.clips.id, c.id));
    throw e;
  }
}
