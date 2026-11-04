"use client";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Lightbulb, Music2, Plus, Trash2, X } from "lucide-react";
import { useT } from "@/components/i18n";
import { Dots } from "@/components/ui";
import { parseSong, timecode } from "@/lib/notes";
import { addNotes, deleteNote } from "../../notes";

export type Note = { id: number; kind: "fact" | "song"; body: string; artist: string | null; atSec: number | null; mine: boolean };

/** Fun facts and the songs of the film, added at upload or here by those who may. */
export function TitleNotes({ titleId, notes, canEdit, staff }: { titleId: number; notes: Note[]; canEdit: boolean; staff: boolean }) {
  const t = useT();
  const facts = notes.filter((n) => n.kind === "fact");
  const songs = notes.filter((n) => n.kind === "song");
  if (!facts.length && !songs.length && !canEdit) return null;
  return (
    <div className="mx-4 mt-12 grid gap-10 md:mx-10 lg:grid-cols-2">
      <Block title={t("Anecdotes")} icon={<Lightbulb size={17} className="text-lime" />} canEdit={canEdit} empty={!facts.length} titleId={titleId} kind="fact">
        <ul className="space-y-4">
          {facts.map((n) => (
            <li key={n.id} className="group flex gap-3 border-l-2 border-lime/60 pl-4 text-bone/90">
              <p className="flex-1 leading-relaxed">{n.body}</p>
              {(n.mine || staff) && <Remove id={n.id} />}
            </li>
          ))}
        </ul>
      </Block>
      <Block title={t("Musiques")} icon={<Music2 size={17} className="text-lime" />} canEdit={canEdit} empty={!songs.length} titleId={titleId} kind="song">
        <ol className="divide-y divide-line border-y border-line">
          {songs
            .sort((a, b) => (a.atSec ?? 1e9) - (b.atSec ?? 1e9))
            .map((n) => (
              <li key={n.id} className="group flex items-center gap-4 py-3">
                <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-dim">{n.atSec != null ? timecode(n.atSec) : ""}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{n.body}</span>
                  {n.artist && <span className="block truncate text-sm text-dim">{n.artist}</span>}
                </span>
                {(n.mine || staff) && <Remove id={n.id} />}
              </li>
            ))}
        </ol>
      </Block>
    </div>
  );
}

function Block({ title, icon, children, canEdit, empty, titleId, kind }: { title: string; icon: React.ReactNode; children: React.ReactNode; canEdit: boolean; empty: boolean; titleId: number; kind: "fact" | "song" }) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  if (empty && !canEdit) return null;
  return (
    <section>
      <h2 className="mb-5 flex items-center gap-2 font-display text-xl font-semibold tracking-tight md:text-2xl">
        {icon} {title}
        {canEdit && (
          <button onClick={() => setAdding(!adding)} aria-label={t("Ajouter")} title={t("Ajouter")} className={`ml-auto grid size-9 place-items-center border transition-colors ${adding ? "border-lime text-lime" : "border-line text-dim hover:text-bone"}`}>
            <Plus size={16} />
          </button>
        )}
      </h2>
      <AnimatePresence>{adding && <AddForm titleId={titleId} kind={kind} onDone={() => setAdding(false)} />}</AnimatePresence>
      {empty ? <p className="text-sm text-dim">{t(kind === "fact" ? "Pas encore d'anecdote." : "Pas encore de musique.")}</p> : children}
    </section>
  );
}

function AddForm({ titleId, kind, onDone }: { titleId: number; kind: "fact" | "song"; onDone: () => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const items = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (kind === "fact" ? { kind: "fact" as const, body: l } : parseSong(l)))
    .filter((x) => x !== null);
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-5 overflow-hidden">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoFocus
        placeholder={t(kind === "fact" ? "Une anecdote par ligne" : "Une musique par ligne : Titre – Artiste – 1:02:03")}
        className="w-full resize-y border border-line bg-transparent p-3 text-sm outline-none focus:border-lime"
      />
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          disabled={!items.length || pending}
          onClick={() =>
            start(async () => {
              const r = await addNotes(titleId, items);
              if (!r.ok) return setError(t(r.error ?? "Oups. Réessaie."));
              setText("");
              onDone();
            })
          }
          aria-label={t("Enregistrer")}
          title={t("Enregistrer")}
          className="grid size-9 place-items-center bg-lime text-ink disabled:opacity-40"
        >
          {pending ? <Dots /> : <Check size={16} />}
        </button>
        <button onClick={onDone} aria-label={t("Annuler")} title={t("Annuler")} className="grid size-9 place-items-center border border-line text-dim hover:text-bone">
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
}

function Remove({ id }: { id: number }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <button onClick={() => start(() => deleteNote(id))} aria-label={t("Supprimer")} title={t("Supprimer")} className="shrink-0 text-dim opacity-0 transition-opacity hover:text-coral group-hover:opacity-100 focus:opacity-100">
      {pending ? <Dots /> : <Trash2 size={14} />}
    </button>
  );
}
