"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ban, Check, ExternalLink, Trash2 } from "lucide-react";
import { resolveReport } from "../actions";
import { useT, useTag } from "@/components/i18n";

type Row = {
  id: number;
  type: string;
  targetId: string;
  reason: string;
  note: string | null;
  snapshot: { text?: string; handle?: string; kind?: string } | null;
  status: string;
  at: string;
  reporter: string | null;
  target: string | null;
  banned: boolean;
};

const REASON: Record<string, string> = { spam: "Spam", harassment: "Harcèlement", hate: "Haine", spoiler: "Spoiler non signalé", illegal: "Contenu illégal", other: "Autre" };
const TYPE: Record<string, string> = { post: "Post", user: "Profil", message: "Message" };

export function ReportsList({ rows, view }: { rows: Row[]; view: string }) {
  const t = useT();
  const tag = useTag();
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [, start] = useTransition();
  const act = (id: number, a: "remove" | "ban" | "dismiss") => {
    setGone(new Set(gone).add(id));
    start(() => resolveReport(id, a));
  };
  const shown = rows.filter((r) => !gone.has(r.id));
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-6xl">{t("Signalements")}</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/studio/reports" className={view === "open" ? "text-bone" : "text-dim hover:text-bone"}>{t("Ouverts")}</Link>
          <Link href="/studio/reports?view=done" className={view === "done" ? "text-bone" : "text-dim hover:text-bone"}>{t("Tous")}</Link>
        </div>
      </div>
      {shown.length === 0 && <p className="py-24 text-center font-display text-4xl text-bone/15">{t("Calme plat.")}</p>}
      <ul className="divide-y divide-line border-y border-line">
        <AnimatePresence initial={false}>
          {shown.map((r) => (
            <motion.li key={r.id} layout exit={{ opacity: 0, x: 40 }} className="grid gap-4 py-5 md:grid-cols-[1fr_auto] md:items-start">
              <div className="min-w-0 space-y-2">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wider">
                  <span className="text-coral">{t(REASON[r.reason] ?? r.reason)}</span>
                  <span className="text-dim">{t(TYPE[r.type] ?? r.type)}</span>
                  {r.target && (
                    <Link href={`/u/${r.target}`} className="text-bone hover:text-lime">
                      @{r.target} {r.banned && <span className="text-coral">· {t("banni")}</span>}
                    </Link>
                  )}
                  <span className="text-dim">
                    {t("par")} @{r.reporter ?? "?"} · {new Date(r.at).toLocaleString(tag, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {r.status !== "open" && <span className="text-lime">{r.status}</span>}
                </p>
                {r.snapshot?.text && <p className="whitespace-pre-line border-l-2 border-line pl-3 text-bone/90">{r.snapshot.text}</p>}
                {r.note && <p className="text-sm text-dim">{r.note}</p>}
                {r.type === "post" && (
                  <Link href={`/p/${r.targetId}`} className="inline-flex items-center gap-1 text-xs text-dim hover:text-lime">
                    <ExternalLink size={12} /> {t("Voir le post")}
                  </Link>
                )}
              </div>
              {r.status === "open" && (
                <div className="flex gap-2">
                  {r.type !== "user" && (
                    <button onClick={() => act(r.id, "remove")} title={t("Retirer le contenu")} aria-label={t("Retirer le contenu")} className="grid size-10 place-items-center border border-line hover:border-coral hover:text-coral">
                      <Trash2 size={15} />
                    </button>
                  )}
                  <button onClick={() => act(r.id, "ban")} title={t("Bannir l'auteur")} aria-label={t("Bannir l'auteur")} className="grid size-10 place-items-center border border-line hover:border-coral hover:text-coral">
                    <Ban size={15} />
                  </button>
                  <button onClick={() => act(r.id, "dismiss")} title={t("Classer")} aria-label={t("Classer")} className="grid size-10 place-items-center border border-line hover:border-lime hover:text-lime">
                    <Check size={15} />
                  </button>
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
