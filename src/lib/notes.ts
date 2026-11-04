/** "Titre – Artiste – 1:02:03" (artist and time optional) → a song note. Shared by the forms. */
export function parseSong(line: string): { kind: "song"; body: string; artist: string | null; atSec: number | null } | null {
  const parts = line.split(/\s+[–—-]\s+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  const last = parts.at(-1)!;
  let atSec: number | null = null;
  if (/^\d{1,2}(:\d{2}){1,2}$/.test(last)) {
    atSec = last.split(":").reduce((a, b) => a * 60 + Number(b), 0);
    parts.pop();
  }
  const [body, artist] = parts;
  return body ? { kind: "song", body: body.slice(0, 500), artist: artist?.slice(0, 120) ?? null, atSec } : null;
}

export const timecode = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(sec).padStart(2, "0")}`;
};
