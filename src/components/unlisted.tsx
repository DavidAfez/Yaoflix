"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, ImagePlus, X } from "lucide-react";
import { requestUnlisted } from "@/app/t/unlisted";
import { useT } from "./i18n";
import { Choice, Dots, Field, FormError } from "./ui";
import { kindLabel } from "@/lib/kinds";

type Kind = "movie" | "tv" | "album" | "book";
type Candidate = { name: string; byline: string | null; year: number | null; image: string; note: string | null };

/**
 * Asking for (or adding) a title the catalogue search can't find. Typing the title brings
 * suggestions with their poster: one tap picks the right one. Only when none fits does the
 * member add a picture of their own.
 */
export function UnlistedSheet({ initial, onClose, kind: start0 = "movie" }: { initial: string; onClose: () => void; kind?: Kind }) {
  const t = useT();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(start0);
  const [name, setName] = useState(initial);
  const [year, setYear] = useState("");
  const [byline, setByline] = useState("");
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [manual, setManual] = useState(false);
  const [poster, setPoster] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const library = kind === "album" || kind === "book";

  // Suggestions follow the title and the format, unless one is already picked
  useEffect(() => {
    if (picked || name.trim().length < 2) return;
    let stale = false;
    const h = setTimeout(async () => {
      setSearching(true);
      const r = (await fetch(`/api/titles/candidates?kind=${kind}&q=${encodeURIComponent(name.trim())}`).then((x) => x.json()).catch(() => ({ items: [] }))) as { items: Candidate[] };
      if (stale) return;
      setItems(r.items ?? []);
      setSearching(false);
    }, 450);
    return () => {
      stale = true;
      clearTimeout(h);
    };
  }, [name, kind, picked]);

  const pick = (c: Candidate) => {
    setPicked(c);
    setName(c.name);
    setYear(c.year ? String(c.year) : "");
    setByline(c.byline ?? "");
    setPoster(null);
    setManual(false);
  };

  const upload = async (f: File | undefined) => {
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
      const r = await requestUnlisted({
        kind,
        name,
        byline: library ? byline : null,
        year: y && Number.isInteger(y) ? y : null,
        posterId: poster,
        posterUrl: poster ? null : (picked?.image ?? null),
      });
      if (!r.ok || !r.href) return setError(t(r.error ?? "Oups. Réessaie."));
      onClose();
      router.push(r.href);
    });

  const square = kind === "album";
  const cover = poster ? `/api/images/${poster}` : picked?.image ?? null;

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[110] bg-ink/70 backdrop-blur-sm" />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-[115] max-h-[92dvh] overflow-y-auto border-t-2 border-lime bg-ink-2 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6 md:left-auto md:top-0 md:max-h-none md:w-[480px] md:border-l-2 md:border-t-0 md:pt-10"
      >
        <div className="mb-6 flex items-center justify-between">
          <p className="font-display text-xl font-semibold">{t(library ? (kind === "album" ? "Ajouter un album" : "Ajouter un livre") : "Demander un titre absent")}</p>
          <button onClick={onClose} aria-label={t("Fermer")} className="text-dim hover:text-bone">
            <X />
          </button>
        </div>

        <div className="space-y-6">
          <Choice
            name="unlisted-kind"
            label="Format"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setPicked(null);
              setItems(null);
            }}
            options={library ? [{ value: "album", label: "Album" }, { value: "book", label: "Livre" }] : [{ value: "movie", label: "Film" }, { value: "tv", label: "Série" }]}
          />
          <Field
            label="Titre"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setPicked(null);
            }}
            maxLength={120}
            required
          />

          {/* Suggestions with their picture: tap the right one */}
          {!manual && (
            <div>
              <p className="mb-3 flex items-center gap-2 text-sm text-dim">
                {picked ? t("C'est noté.") : t("C'est l'un d'eux ?")} {searching && <Dots />}
              </p>
              {items && items.length > 0 ? (
                <div className="scrollbar-none -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
                  {(picked ? [picked] : items).map((c) => {
                    const on = picked?.image === c.image;
                    return (
                      <button key={c.image} type="button" onClick={() => (on ? setPicked(null) : pick(c))} className="w-28 shrink-0 snap-start text-left">
                        <span className={`relative block ${square ? "aspect-square" : "aspect-[2/3]"} overflow-hidden bg-ink ring-2 transition ${on ? "ring-lime" : "ring-transparent hover:ring-bone/30"}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
                          {on && (
                            <span className="absolute right-1 top-1 grid size-6 place-items-center bg-lime text-ink">
                              <Check size={14} strokeWidth={3} />
                            </span>
                          )}
                        </span>
                        <span className="mt-1.5 block truncate text-xs">{c.name}</span>
                        <span className="block truncate font-mono text-[10px] text-dim">{[c.year, c.byline].filter(Boolean).join(" · ") || c.note}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                items && !searching && <p className="text-sm text-dim">{t("Aucune suggestion.")}</p>
              )}
              {picked ? (
                <button type="button" onClick={() => setPicked(null)} className="mt-3 text-xs text-dim underline-offset-4 hover:text-bone hover:underline">
                  {t("Ce n'est pas lui")}
                </button>
              ) : (
                <button type="button" onClick={() => setManual(true)} className="mt-3 text-xs text-dim underline-offset-4 hover:text-bone hover:underline">
                  {t("Aucun ne correspond : ajouter l'image moi-même")}
                </button>
              )}
            </div>
          )}

          {/* Last resort: the member's own picture */}
          <AnimatePresence>
            {manual && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-4 overflow-hidden">
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => input.current?.click()}
                    className={`relative grid ${square ? "aspect-square" : "aspect-[2/3]"} w-28 shrink-0 place-items-center overflow-hidden border border-dashed border-line bg-ink text-dim transition-colors hover:border-lime hover:text-lime`}
                  >
                    {poster && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/images/${poster}`} alt="" className="absolute inset-0 size-full object-cover" />
                    )}
                    <span className={`relative flex flex-col items-center gap-1 text-xs ${poster ? "bg-ink/70 px-2 py-1" : ""}`}>
                      {uploading ? <Dots /> : <ImagePlus size={18} />}
                      {t(poster ? "Changer" : library ? "Couverture" : "Affiche")}
                    </span>
                  </button>
                  <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
                  <p className="self-center text-xs text-dim">{t("Une image de l'affiche ou de la couverture, depuis ton téléphone ou ton ordi.")}</p>
                </div>
                <button type="button" onClick={() => setManual(false)} className="text-xs text-dim underline-offset-4 hover:text-bone hover:underline">
                  {t("Revoir les suggestions")}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-2 gap-6">
            <Field label="Année (facultatif)" type="number" inputMode="numeric" min={1888} max={2100} value={year} onChange={(e) => setYear(e.target.value)} />
            {library && <Field label={kind === "album" ? "Artiste" : "Auteur"} value={byline} onChange={(e) => setByline(e.target.value)} maxLength={120} />}
          </div>

          {/* The request as it will show */}
          <div className="flex items-center gap-4 border-t border-line pt-5">
            <span className={`block ${square ? "aspect-square" : "aspect-[2/3]"} w-14 shrink-0 overflow-hidden bg-ink`}>
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display font-semibold">{name.trim() || t("Titre")}</span>
              <span className="block font-mono text-xs text-dim">
                {[year || null, library ? byline || null : null, t(kindLabel[kind])].filter(Boolean).join(" · ")}
              </span>
            </span>
          </div>

          <FormError message={error} />
          <button onClick={send} disabled={pending || uploading || !name.trim()} className="notch flex h-12 w-full items-center justify-center bg-lime font-semibold text-ink disabled:opacity-40">
            {pending ? <Dots /> : t(library ? "Ajouter" : "Demander")}
          </button>
        </div>
      </motion.div>
    </>
  );
}
