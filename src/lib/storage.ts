import path from "node:path";

export const MEDIA_ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_ROOT ?? "./storage");
export const paths = {
  sourceDir: path.join(MEDIA_ROOT, "sources"),
  source: (mediaId: string) => path.join(MEDIA_ROOT, "sources", `${mediaId}.bin`),
  hlsDir: (mediaId: string) => path.join(MEDIA_ROOT, "hls", mediaId),
  voiceDir: path.join(MEDIA_ROOT, "voice"),
  voice: (file: string) => path.join(MEDIA_ROOT, "voice", file),
  clipsDir: path.join(MEDIA_ROOT, "clips"),
  imagesDir: path.join(MEDIA_ROOT, "images"),
  image: (id: string) => path.join(MEDIA_ROOT, "images", id),
  clip: (id: string, kind: string) => path.join(MEDIA_ROOT, "clips", `${id}.${kind === "image" ? "jpg" : "mp4"}`),
};

/** Resolve a path inside root, refusing traversal. */
export function safeJoin(root: string, ...parts: string[]): string | null {
  const full = path.resolve(root, ...parts);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}
