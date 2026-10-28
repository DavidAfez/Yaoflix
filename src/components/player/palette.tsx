"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Download, Send, X } from "lucide-react";
import { createPost } from "@/app/feed/actions";
import { useT } from "../i18n";
import { Dots } from "../ui";

type RGB = [number, number, number];
const hex = (c: RGB) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const fmt = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

/** Six dominant colours with k-means on a downscaled frame, darkest to lightest. */
function palette(src: CanvasImageSource, k = 6): RGB[] {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 54;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, 96, 54);
  const d = g.getImageData(0, 0, 96, 54).data;
  const px: RGB[] = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
  // Spread the starting centres: k-means++ style, deterministic
  const centres: RGB[] = [px[Math.floor(px.length / 2)]];
  while (centres.length < k) {
    let best = px[0];
    let far = -1;
    for (const p of px) {
      const near = Math.min(...centres.map((q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2));
      if (near > far) {
        far = near;
        best = p;
      }
    }
    centres.push(best);
  }
  for (let it = 0; it < 12; it++) {
    const sum = centres.map(() => [0, 0, 0, 0]);
    for (const p of px) {
      let j = 0;
      let dmin = Infinity;
      centres.forEach((q, i) => {
        const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (dd < dmin) {
          dmin = dd;
          j = i;
        }
      });
      sum[j][0] += p[0];
      sum[j][1] += p[1];
      sum[j][2] += p[2];
      sum[j][3]++;
    }
    sum.forEach((s, i) => s[3] && (centres[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]));
  }
  return [...centres].sort((a, b) => lum(a) - lum(b));
}

/** Frame + colour band + title and timecode, as one picture. */
async function compose(video: HTMLVideoElement, title: string): Promise<{ blob: Blob; colors: RGB[] }> {
  const W = 1280;
  const vh = Math.round((W * (video.videoHeight || 720)) / (video.videoWidth || 1280));
  const band = 220;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = vh + band;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0b0d";
  g.fillRect(0, 0, W, c.height);
  g.drawImage(video, 0, 0, W, vh);
  const colors = palette(video);
  const sw = W / colors.length;
  colors.forEach((col, i) => {
    g.fillStyle = hex(col);
    g.fillRect(i * sw, vh, sw + 1, band - 60);
    g.fillStyle = lum(col) > 140 ? "#0b0b0d" : "#f3f0e8";
    g.font = "600 22px ui-sans-serif, system-ui";
    g.fillText(hex(col), i * sw + 18, vh + band - 82);
  });
  g.fillStyle = "#f3f0e8";
  g.font = "600 22px ui-sans-serif, system-ui";
  g.fillText(`${title}  ·  ${fmt(video.currentTime)}`, 18, c.height - 22);
  g.font = "800 22px ui-sans-serif, system-ui";
  const brand = "GABAOFLIX.";
  g.fillText(brand, W - g.measureText(brand).width - 18, c.height - 22);
  const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), "image/jpeg", 0.92));
  return { blob, colors };
}

export function PaletteSheet({ video, title, kind, tmdbId, onClose }: { video: React.RefObject<HTMLVideoElement | null>; title: string; kind: string; tmdbId: number; onClose: () => void }) {
  const t = useT();
  const [img, setImg] = useState<{ url: string; blob: Blob; colors: RGB[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.pause();
    let url: string | null = null;
    // No decoded frame yet (just loaded, or a codec the browser can't paint): nothing to read
    if (v.readyState < 2 || !v.videoWidth) {
      setError(t("Lance la lecture un instant, puis réessaie."));
      return;
    }
    compose(v, title)
      .then((r) => {
        url = URL.createObjectURL(r.blob);
        setImg({ url, ...r });
      })
      .catch(() => setError(t("Image indisponible sur ce navigateur")));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [video, title, t]);

  const publish = async () => {
    if (!img) return;
    setState("sending");
    const fd = new FormData();
    fd.set("file", new File([img.blob], "palette.jpg", { type: "image/jpeg" }));
    const up = (await fetch("/api/images", { method: "POST", body: fd }).then((r) => r.json()).catch(() => ({}))) as { id?: string; error?: string };
    if (!up.id) {
      setState("idle");
      return setError(t(up.error ?? "Envoi impossible"));
    }
    const res = await createPost({ body: text, kind: kind as "movie" | "tv", tmdbId, media: [{ type: "image", id: up.id }] });
    if (!res.ok) {
      setState("idle");
      return setError(t(res.error ?? "Oups"));
    }
    setState("sent");
    setTimeout(onClose, 1000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerUp={(e) => e.stopPropagation()}
      className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-ink/90 p-4 backdrop-blur"
    >
      <div className="w-full max-w-3xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-xl font-semibold">{t("Palette")}</p>
          <button onClick={onClose} aria-label={t("Fermer")} className="text-dim hover:text-bone">
            <X />
          </button>
        </div>
        {error && <p className="mb-3 text-sm text-coral">{error}</p>}
        {!img ? (
          !error && <Dots />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt="" className="w-full" />
            <div className="mt-3 flex flex-wrap gap-2">
              {img.colors.map((c) => (
                <button key={hex(c)} onClick={() => void navigator.clipboard?.writeText(hex(c))} title={t("Copier")} className="flex items-center gap-2 border border-line px-2 py-1 font-mono text-xs hover:border-bone/40">
                  <span className="size-4" style={{ background: hex(c) }} />
                  {hex(c)}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={t("Ton commentaire")} className="h-11 min-w-0 flex-1 border border-line bg-transparent px-3 outline-none focus:border-lime" />
              <a href={img.url} download={`${title.replace(/[^\w-]+/g, "_")}-palette.jpg`} aria-label={t("Télécharger")} title={t("Télécharger")} className="grid size-11 place-items-center border border-line hover:border-lime hover:text-lime">
                <Download size={17} />
              </a>
              <button onClick={() => void publish()} disabled={state !== "idle"} aria-label={t("Publier")} title={t("Publier")} className="notch flex h-11 items-center gap-2 bg-lime px-5 font-semibold text-ink disabled:opacity-40">
                {state === "sending" ? <Dots /> : state === "sent" ? "✓" : <><Send size={16} /> {t("Publier")}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
