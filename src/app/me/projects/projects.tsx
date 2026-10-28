"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Eye, ImagePlus, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { Choice, Dots, Field, FormError } from "@/components/ui";
import { useT } from "@/components/i18n";
import { Uploader } from "@/app/studio/library/library";
import { CREATOR_GENRES, CREW_JOBS } from "@/lib/labels";
import { deleteProject, requestCreator, saveProject } from "./actions";

type Media = { id: string; status: string; progress: number };
export type Project = {
  id: number;
  tmdbId: number;
  kind: "movie" | "tv";
  name: string;
  originalName: string;
  overview: string;
  releaseDate: string;
  year: number | null;
  genres: string[];
  runtime: number | null;
  episodes: number | null;
  posterId: string | null;
  backdropId: string | null;
  poster: string | null;
  crew: { job: string; names: string[] }[];
  cast: { name: string; role: string | null }[];
  media: Media[];
};

const blank = (): Project => ({
  id: 0,
  tmdbId: 0,
  kind: "movie",
  name: "",
  originalName: "",
  overview: "",
  releaseDate: "",
  year: null,
  genres: [],
  runtime: null,
  episodes: null,
  posterId: null,
  backdropId: null,
  poster: null,
  crew: [{ job: "Réalisation", names: [] }],
  cast: [],
  media: [],
});

const STATUS: Record<string, string> = { UPLOADING: "Envoi", QUEUED: "File", PROCESSING: "Encodage", READY: "En ligne", FAILED: "Échec" };

export function AskCreator({ status }: { status: "requested" | "approved" | "refused" | null }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      <p className="text-bone/80">
        {t("Pour les vidéastes : tu mets en ligne tes courts, films ou séries, avec affiche, synopsis et générique, et les membres les regardent comme le reste du catalogue. L'équipe valide la demande.")}
      </p>
      {status === "requested" ? (
        <p className="border-l-2 border-lime pl-3 text-sm">{t("Demande envoyée. L'équipe te répond vite.")}</p>
      ) : (
        <>
          {status === "refused" && <p className="text-sm text-coral">{t("Ta dernière demande n'a pas été retenue.")}</p>}
          <button onClick={() => start(() => requestCreator())} disabled={pending} className="notch inline-flex h-12 items-center gap-2 bg-lime px-6 font-semibold text-ink disabled:opacity-40">
            {pending ? <Dots /> : t("Demander un profil créateur")}
          </button>
        </>
      )}
    </div>
  );
}

export function Projects({ projects }: { projects: Project[] }) {
  const t = useT();
  const [editing, setEditing] = useState<Project | null>(null);
  const [uploading, setUploading] = useState<Project | null>(null);
  const router = useRouter();
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,560px)_1fr]">
      <section>
        <AnimatePresence mode="wait">
          {editing ? (
            <Editor
              key={editing.id || "new"}
              value={editing}
              onClose={() => setEditing(null)}
              onSaved={(p) => {
                setEditing(null);
                router.refresh();
                if (!p.media.length) setUploading(p);
              }}
            />
          ) : uploading ? (
            <motion.div key="up" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Uploader
                title={{ id: uploading.id, kind: uploading.kind, tmdbId: uploading.tmdbId, name: uploading.name, year: uploading.year, poster: uploading.poster }}
                onClose={() => setUploading(null)}
                onDone={() => router.refresh()}
              />
            </motion.div>
          ) : (
            <motion.button
              key="add"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setEditing(blank())}
              className="flex h-40 w-full flex-col items-center justify-center gap-3 border-2 border-dashed border-line text-dim transition-colors hover:border-lime hover:text-lime"
            >
              <Plus size={28} />
              {t("Nouveau projet")}
            </motion.button>
          )}
        </AnimatePresence>
      </section>
      <section>
        <ul className="divide-y divide-line border-y border-line">
          {projects.map((p) => (
            <ProjectLine key={p.id} p={p} onEdit={() => (setUploading(null), setEditing(p))} onUpload={() => (setEditing(null), setUploading(p))} />
          ))}
        </ul>
        {!projects.length && <p className="py-16 text-center font-display text-2xl text-bone/15">{t("Aucun projet pour l'instant.")}</p>}
      </section>
    </div>
  );
}

function ProjectLine({ p, onEdit, onUpload }: { p: Project; onEdit: () => void; onUpload: () => void }) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const m = p.media[0];
  return (
    <li className="flex items-center gap-4 py-3">
      <div className="h-20 w-14 shrink-0 bg-ink-3">
        {p.poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.poster} alt="" className="size-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg font-semibold">{p.name}</p>
        <p className="font-mono text-xs text-dim">
          {p.year} · {m ? `${t(STATUS[m.status] ?? m.status)}${m.status === "PROCESSING" ? ` ${m.progress}%` : ""}` : t("Pas de vidéo")}
        </p>
      </div>
      <Link href={`/t/${p.kind}/${p.tmdbId}`} aria-label={t("Voir")} title={t("Voir")} className="grid size-10 place-items-center border border-line hover:border-lime hover:text-lime">
        <Eye size={15} />
      </Link>
      <button onClick={onEdit} aria-label={t("Modifier")} title={t("Modifier")} className="grid size-10 place-items-center border border-line hover:border-lime hover:text-lime">
        <Pencil size={15} />
      </button>
      {!m && (
        <button onClick={onUpload} aria-label={t("Envoyer la vidéo")} title={t("Envoyer la vidéo")} className="grid size-10 place-items-center bg-lime text-ink">
          <Upload size={15} />
        </button>
      )}
      {confirm ? (
        <button onClick={() => start(() => deleteProject(p.id))} onBlur={() => setConfirm(false)} autoFocus className="flex h-10 items-center gap-2 bg-coral px-3 text-sm font-semibold text-ink">
          {pending ? <Dots /> : <Trash2 size={15} />}
        </button>
      ) : (
        <button onClick={() => setConfirm(true)} aria-label={t("Supprimer")} title={t("Supprimer")} className="grid size-10 place-items-center border border-line hover:border-coral hover:text-coral">
          <Trash2 size={15} />
        </button>
      )}
    </li>
  );
}

async function upload(f: File) {
  const fd = new FormData();
  fd.set("file", f);
  const r = (await fetch("/api/images", { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({}))) as { id?: string; error?: string };
  return r;
}

function ImageSlot({ id, label, wide, onChange }: { id: string | null; label: string; wide?: boolean; onChange: (id: string | null) => void }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      className={`relative grid place-items-center overflow-hidden border border-dashed border-line bg-ink-2 text-dim transition-colors hover:border-lime hover:text-lime ${wide ? "aspect-video" : "aspect-[2/3]"}`}
    >
      {id && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/images/${id}`} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      <span className={`relative flex flex-col items-center gap-1 text-xs ${id ? "bg-ink/70 px-2 py-1" : ""}`}>
        {busy ? <Dots /> : <ImagePlus size={18} />}
        {t(label)}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          const r = await upload(f);
          setBusy(false);
          if (r.id) onChange(r.id);
        }}
      />
    </button>
  );
}

function Editor({ value, onClose, onSaved }: { value: Project; onClose: () => void; onSaved: (p: Project) => void }) {
  const t = useT();
  const [p, setP] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Project>(k: K, v: Project[K]) => setP((x) => ({ ...x, [k]: v }));
  const num = (s: string) => (s.trim() ? Number(s) : null);

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveProject({
        id: p.id || undefined,
        kind: p.kind,
        name: p.name,
        originalName: p.originalName,
        overview: p.overview,
        releaseDate: p.releaseDate,
        genres: p.genres,
        runtime: p.runtime,
        episodes: p.episodes,
        posterId: p.posterId,
        backdropId: p.backdropId,
        crew: p.crew.map((c) => ({ ...c, names: c.names.filter(Boolean) })).filter((c) => c.names.length),
        cast: p.cast.filter((c) => c.name.trim()),
      });
      if (!res.ok || !res.id) return setError(t(res.error ?? "Oups. Réessaie."));
      onSaved({ ...p, id: res.id, tmdbId: res.tmdbId!, poster: p.posterId ? `/api/images/${p.posterId}` : null, year: p.releaseDate ? Number(p.releaseDate.slice(0, 4)) : new Date().getFullYear() });
    });

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-7">
      <div className="flex items-center justify-between">
        <p className="font-display text-2xl font-semibold">{t(p.id ? "Modifier le projet" : "Nouveau projet")}</p>
        <button onClick={onClose} aria-label={t("Fermer")} className="text-dim hover:text-bone">
          <X />
        </button>
      </div>

      <Choice name="kind" label="Format" value={p.kind} onChange={(v) => set("kind", v)} options={[{ value: "movie", label: "Film ou court" }, { value: "tv", label: "Série" }]} />
      <Field label="Titre" value={p.name} onChange={(e) => set("name", e.target.value)} maxLength={120} required />
      <Field label="Titre original (facultatif)" value={p.originalName} onChange={(e) => set("originalName", e.target.value)} maxLength={120} />
      <label className="block">
        <span className="mb-2 block font-display text-xs uppercase tracking-[0.2em]">{t("Synopsis")}</span>
        <textarea value={p.overview} onChange={(e) => set("overview", e.target.value)} maxLength={2000} rows={4} className="w-full resize-y border border-line bg-transparent p-3 outline-none focus:border-lime" />
      </label>

      <div className="grid grid-cols-[2fr_3fr] gap-3">
        <ImageSlot id={p.posterId} label="Affiche" onChange={(id) => set("posterId", id)} />
        <ImageSlot id={p.backdropId} label="Image de fond" wide onChange={(id) => set("backdropId", id)} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Field label="Sortie" type="date" value={p.releaseDate} onChange={(e) => set("releaseDate", e.target.value)} />
        <Field label={p.kind === "tv" ? "Minutes par épisode" : "Durée (min)"} type="number" min={1} max={600} value={p.runtime ?? ""} onChange={(e) => set("runtime", num(e.target.value))} />
        {p.kind === "tv" && <Field label="Épisodes" type="number" min={1} max={500} value={p.episodes ?? ""} onChange={(e) => set("episodes", num(e.target.value))} />}
      </div>

      <fieldset>
        <legend className="mb-3 font-display text-xs uppercase tracking-[0.2em]">{t("Genres (4 max)")}</legend>
        <div className="flex flex-wrap gap-2">
          {CREATOR_GENRES.map((g) => {
            const on = p.genres.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => set("genres", on ? p.genres.filter((x) => x !== g) : p.genres.length < 4 ? [...p.genres, g] : p.genres)}
                className={`border px-3 py-1.5 text-sm transition-colors ${on ? "border-lime bg-lime text-ink" : "border-line text-dim hover:text-bone"}`}
              >
                {t(g)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-3 font-display text-xs uppercase tracking-[0.2em]">{t("Équipe")}</legend>
        {p.crew.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={c.job}
              onChange={(e) => set("crew", p.crew.map((x, j) => (j === i ? { ...x, job: e.target.value } : x)))}
              className="h-10 w-36 shrink-0 border border-line bg-ink px-2 text-sm outline-none focus:border-lime"
            >
              {CREW_JOBS.map((j) => (
                <option key={j} value={j}>
                  {t(j)}
                </option>
              ))}
            </select>
            <input
              value={c.names.join(", ")}
              onChange={(e) => set("crew", p.crew.map((x, j) => (j === i ? { ...x, names: e.target.value.split(",").map((n) => n.trimStart()).slice(0, 10) } : x)))}
              placeholder={t("Noms, séparés par des virgules")}
              className="h-10 min-w-0 flex-1 border-b border-line bg-transparent outline-none focus:border-lime"
            />
            <button type="button" onClick={() => set("crew", p.crew.filter((_, j) => j !== i))} aria-label={t("Retirer")} className="grid size-9 place-items-center text-dim hover:text-coral">
              <X size={15} />
            </button>
          </div>
        ))}
        {p.crew.length < 10 && (
          <button type="button" onClick={() => set("crew", [...p.crew, { job: CREW_JOBS[1], names: [] }])} aria-label={t("Ajouter un poste")} title={t("Ajouter un poste")} className="grid size-9 place-items-center border border-line text-dim hover:border-lime hover:text-lime">
            <Plus size={15} />
          </button>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-3 font-display text-xs uppercase tracking-[0.2em]">{t("Distribution")}</legend>
        {p.cast.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={c.name}
              onChange={(e) => set("cast", p.cast.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              placeholder={t("Nom")}
              className="h-10 min-w-0 flex-1 border-b border-line bg-transparent outline-none focus:border-lime"
            />
            <input
              value={c.role ?? ""}
              onChange={(e) => set("cast", p.cast.map((x, j) => (j === i ? { ...x, role: e.target.value || null } : x)))}
              placeholder={t("Rôle")}
              className="h-10 min-w-0 flex-1 border-b border-line bg-transparent outline-none focus:border-lime"
            />
            <button type="button" onClick={() => set("cast", p.cast.filter((_, j) => j !== i))} aria-label={t("Retirer")} className="grid size-9 place-items-center text-dim hover:text-coral">
              <X size={15} />
            </button>
          </div>
        ))}
        {p.cast.length < 30 && (
          <button type="button" onClick={() => set("cast", [...p.cast, { name: "", role: null }])} aria-label={t("Ajouter quelqu'un")} title={t("Ajouter quelqu'un")} className="grid size-9 place-items-center border border-line text-dim hover:border-lime hover:text-lime">
            <Plus size={15} />
          </button>
        )}
      </fieldset>

      <FormError message={error} />
      <button onClick={save} disabled={pending || !p.name.trim()} className="notch flex h-12 w-full items-center justify-center gap-2 bg-lime font-semibold text-ink disabled:opacity-40">
        {pending ? <Dots /> : <><Check size={17} /> {t("Enregistrer")}</>}
      </button>
    </motion.div>
  );
}
