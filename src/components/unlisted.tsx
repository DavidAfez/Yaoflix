"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ImagePlus, X } from "lucide-react";
import { requestUnlisted } from "@/app/t/unlisted";
import { useT } from "./i18n";
import { Choice, Dots, Field, FormError } from "./ui";

/**
 * Asking for a title the catalogue search can't find. The poster is what tells everyone
 * (and the uploader) which film it is: the member picks it from Google Images and adds it here.
 */
export function UnlistedSheet({ initial, onClose }: { initial: string; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [kind, setKind] = useState<"movie" | "tv">("movie");
  const [name, setName] = useState(initial);
  const [year, setYear] = useState("");
  const [poster, setPoster] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", f);
    const r = (await fetch("/api/images", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({}))) as { id?: string; error?: string };
    setUploading(false);
    if (r.id) setPoster(r.id);
    else setError(t(r.error ?? "Image impossible à envoyer"));
  };

  const send = () =>
    start(async () => {
      setError(null);
      const y = year.trim() ? Number(year) : null;
      const r = await requestUnlisted({ kind, name, year: y && Number.isInteger(y) ? y : null, posterId: poster });
      if (!r.ok || !r.href) return setError(t(r.error ?? "Oups. Réessaie."));
      onClose();
      router.push(r.href);
    });

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[110] bg-ink/70 backdrop-blur-sm" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[115] max-h-[92dvh] overflow-y-auto border-t-2 border-lime bg-ink-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6 md:left-auto md:top-0 md:max-h-none md:w-[440px] md:border-l-2 md:border-t-0 md:pt-10"
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="font-display text-xl font-semibold">{t("Demander un titre absent")}</p>
          <button onClick={onClose} aria-label={t("Fermer")} className="text-dim hover:text-bone">
            <X />
          </button>
        </div>
        <p className="mb-6 text-sm text-dim">{t("Ajoute son affiche pour qu'on soit sûrs du film : sur Google Images, clic droit sur l'affiche, « Enregistrer l'image », puis ajoute-la ici.")}</p>

        <div className="space-y-6">
          <Choice name="unlisted-kind" label="Format" value={kind} onChange={setKind} options={[{ value: "movie", label: "Film" }, { value: "tv", label: "Série" }]} />
          <Field label="Titre" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          <Field label="Année (facultatif)" type="number" inputMode="numeric" min={1888} max={2100} value={year} onChange={(e) => setYear(e.target.value)} />

          {/* What the request will look like: the poster is the proof it's the right one */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="relative grid aspect-[2/3] w-32 shrink-0 place-items-center overflow-hidden border border-dashed border-line bg-ink text-dim transition-colors hover:border-lime hover:text-lime"
            >
              {poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/images/${poster}`} alt="" className="absolute inset-0 size-full object-cover" />
              )}
              <span className={`relative flex flex-col items-center gap-1 text-xs ${poster ? "bg-ink/70 px-2 py-1" : ""}`}>
                {uploading ? <Dots /> : <ImagePlus size={18} />}
                {t(poster ? "Changer" : "Affiche")}
              </span>
            </button>
            <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
            <div className="min-w-0 self-end pb-1">
              <p className="font-display text-lg font-semibold leading-tight">{name.trim() || t("Titre")}</p>
              <p className="font-mono text-xs text-dim">
                {year || "—"} · {t(kind === "movie" ? "Film" : "Série")}
              </p>
              {poster && <p className="mt-2 text-xs text-lime">{t("C'est bien lui ?")}</p>}
            </div>
          </div>

          <FormError message={error} />
          <button onClick={send} disabled={pending || uploading || !name.trim()} className="notch flex h-12 w-full items-center justify-center bg-lime font-semibold text-ink disabled:opacity-40">
            {pending ? <Dots /> : t("Demander")}
          </button>
        </div>
      </motion.div>
    </>
  );
}
