import path from "node:path";

export const MEDIA_ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_ROOT ?? "./storage");
export const paths = {
  sourceDir: path.join(MEDIA_ROOT, "sources"),
  source: (mediaId: string) => path.join(MEDIA_ROOT, "sources", `${mediaId}.bin`),
  hlsDir: (mediaId: string) => path.join(MEDIA_ROOT, "hls", mediaId),
  voiceDir: path.join(MEDIA_ROOT, "voice"),
  voice: (file: string) => path.join(MEDIA_ROOT, "voice", file),
};

/** Resolve a path inside root, refusing traversal. */
export function safeJoin(root: string, ...parts: string[]): string | null {
  const full = path.resolve(root, ...parts);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}
