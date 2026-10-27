"use client";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Play, Search } from "lucide-react";
import { Poster, type PosterData } from "@/components/poster";
import { Choice, Field, Submit, FormError } from "@/components/ui";
import { StatusMark } from "@/components/status";
import { ageBrackets, sexes } from "@/lib/labels";
import { saveProfile, saveWhatsApp, deleteAccount } from "./actions";
import type { RejectReason, RequestPrefs } from "@/db/schema";

type Status = "PENDING" | "IN_PROGRESS" | "FULFILLED" | "REJECTED";
type Req = { id: string; status: Status; reason: RejectReason | null; at: string; prefs: RequestPrefs; poster: PosterData };
type Watching = { grantId: string; name: string; backdrop: string | null; progress: number; daysLeft: number };
type Share = { label: string; share: number };
type Overview = { watching: Watching[]; taste: Share[]; recency: Share[]; recos: PosterData[]; listed: PosterData[]; toAsk: PosterData[] };

const TABS = ["Moi", "Aimés", "Vus", "Demandes", "Réglages"] as const;

export function MeTabs(props: {
  overview: Overview;
  liked: PosterData[];
  seen: PosterData[];
  requests: Req[];
  profile: { handle: string; age: string; sex: string; hasPhone: boolean; optIn: boolean };
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Moi");
  return (
    <>
      <nav className="scrollbar-none sticky top-0 z-20 -mx-4 flex gap-8 overflow-x-auto border-b border-line bg-ink/90 px-4 backdrop-blur md:top-16 md:-mx-10 md:px-10">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`relative shrink-0 py-5 text-sm ${tab === t ? "text-bone" : "text-dim hover:text-bone"}`}>
            {t}
            {t === "Aimés" && props.liked.length > 0 && <span className="ml-1.5 font-mono text-[11px] text-lime">{props.liked.length}</span>}
            {t === "Vus" && props.seen.length > 0 && <span className="ml-1.5 font-mono text-[11px] text-lime">{props.seen.length}</span>}
            {t === "Demandes" && props.requests.length > 0 && <span className="ml-1.5 font-mono text-[11px] text-lime">{props.requests.length}</span>}
            {tab === t && <motion.span layoutId="me-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" />}
          </button>
        ))}
      </nav>
      <AnimatePresence mode="wait">
        <motion.section key={tab} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="pt-8">
          {tab === "Moi" && <OverviewTab {...props.overview} />}
          {tab === "Aimés" && (props.liked.length ? <Grid items={props.liked} /> : <Empty word="Aucun coup de cœur." />)}
          {tab === "Vus" && (props.seen.length ? <Grid items={props.seen} /> : <Empty word="Rien de vu encore." />)}
          {tab === "Demandes" && <Requests items={props.requests} />}
          {tab === "Réglages" && <Settings {...props.profile} />}
        </motion.section>
      </AnimatePresence>
    </>
  );
}

/** Ghost headline plus one clear way out, never a dead end. */
function Empty({ word }: { word: string }) {
  return (
    <div className="flex flex-col items-start gap-6 py-14">
      <p className="font-display text-4xl font-extrabold leading-none tracking-tight text-bone/15 md:text-6xl">{word}</p>
      <Link href="/" className="notch flex h-11 items-center gap-2 bg-lime px-5 text-sm font-semibold text-ink">
        <Search size={16} /> Chercher
      </Link>
    </div>
  );
}

function Section({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
        {href && (
          <Link href={href} className="flex items-center gap-1 text-sm text-dim hover:text-lime" aria-label={`${title} : tout`}>
            Tout <ArrowRight size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Strip({ items }: { items: PosterData[] }) {
  return (
    <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:-mx-10 md:gap-5 md:px-10">
      {items.map((p, i) => (
        <Poster key={`${p.kind}${p.tmdbId}`} t={p} i={i} />
      ))}
    </div>
  );
}

function Bars({ rows }: { rows: Share[] }) {
  const max = Math.max(...rows.map((r) => r.share), 0.0001);
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-sm md:grid-cols-[9rem_1fr_3rem]">
          <span className="truncate">{r.label}</span>
          <span className="relative h-2.5 bg-bone/5">
            <motion.span
              className="absolute inset-y-0 left-0 bg-lime"
              initial={{ width: 0 }}
              animate={{ width: `${(r.share / max) * 100}%` }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
          <span className="text-right font-mono text-xs tabular-nums text-bone/70">{Math.round(r.share * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

function OverviewTab({ watching, taste, recency, recos, listed, toAsk }: Overview) {
  const nothing = !watching.length && !taste.length && !recos.length && !listed.length && !toAsk.length;
  if (nothing) return <Empty word="Tout reste à voir." />;
  return (
    <>
      {watching.length > 0 && (
        <Section title="En cours">
          <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 md:-mx-10 md:px-10">
            {watching.map((w, i) => (
              <motion.div key={w.grantId} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="shrink-0 snap-start">
                <Link href={`/w/${w.grantId}`} className="group relative block h-36 w-[78vw] overflow-hidden bg-ink-3 md:h-44 md:w-96">
                  {w.backdrop && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.backdrop} alt="" className="absolute inset-0 size-full object-cover opacity-60 transition-transform duration-700 group-hover:scale-105" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-semibold">{w.name}</p>
                      <p className="font-mono text-[11px] text-bone/70">
                        {Math.round(w.progress * 100)}% · <span className="text-lime">J-{w.daysLeft}</span>
                      </p>
                    </div>
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-ink transition-transform group-hover:scale-110">
                      <Play size={16} fill="currentColor" className="translate-x-px" />
                    </span>
                  </div>
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-bone/10">
                    <motion.span className="block h-full bg-lime" initial={{ width: 0 }} animate={{ width: `${w.progress * 100}%` }} transition={{ duration: 1, delay: 0.2 }} />
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </Section>
      )}

      {(taste.length > 0 || recency.length > 0) && (
        <div className="mb-14 grid gap-12 md:grid-cols-2 md:gap-16">
          {taste.length > 0 && (
            <div>
              <h2 className="mb-5 font-display text-xl font-semibold tracking-tight md:text-2xl">Ton goût</h2>
              <Bars rows={taste} />
            </div>
          )}
          {recency.length > 0 && (
            <div>
              <h2 className="mb-5 font-display text-xl font-semibold tracking-tight md:text-2xl">Tes époques</h2>
              <Bars rows={recency} />
            </div>
          )}
        </div>
      )}

      {recos.length > 0 && (
        <Section title="Pour toi">
          <Strip items={recos} />
        </Section>
      )}
      {listed.length > 0 && (
        <Section title="Ma liste" href="/list">
          <Strip items={listed} />
        </Section>
      )}
      {toAsk.length > 0 && (
        <Section title="À demander">
          <Strip items={toAsk} />
        </Section>
      )}
    </>
  );
}

function Grid({ items }: { items: PosterData[] }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-6 md:gap-x-5 xl:grid-cols-8 [&>*]:w-auto">
      {items.map((p, i) => (
        <Poster key={`${p.kind}${p.tmdbId}`} t={p} i={i} />
      ))}
    </div>
  );
}

const FILTERS: { key: "ALL" | "OPEN" | "FULFILLED" | "REJECTED"; label: string }[] = [
  { key: "ALL", label: "Toutes" },
  { key: "OPEN", label: "En attente" },
  { key: "FULFILLED", label: "Prêtes" },
  { key: "REJECTED", label: "Refusées" },
];
const match = (f: (typeof FILTERS)[number]["key"], s: Status) =>
  f === "ALL" || (f === "OPEN" ? s === "PENDING" || s === "IN_PROGRESS" : s === f);
const prefLabel = (p: RequestPrefs) =>
  [p.quality === "auto" ? "Auto" : p.quality === "2160" ? "4K" : `${p.quality}p`, p.audio === "any" ? null : p.audio.toUpperCase(), p.subs === "none" ? null : `ST ${p.subs.toUpperCase()}`]
    .filter(Boolean)
    .join(" · ");

function Requests({ items }: { items: Req[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("ALL");
  const shown = useMemo(() => items.filter((r) => match(filter, r.status)), [items, filter]);
  if (!items.length) return <Empty word="Aucune demande." />;
  return (
    <>
      <div className="scrollbar-none mb-6 flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => {
          const n = items.filter((r) => match(f.key, r.status)).length;
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex shrink-0 items-center gap-2 border px-3 py-2 text-sm transition-colors ${on ? "border-lime text-lime" : "border-line text-dim hover:text-bone"}`}
            >
              {f.label}
              <span className="font-mono text-[11px] tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>
      <ul className="divide-y divide-line border-y border-line">
        <AnimatePresence initial={false}>
          {shown.map((r, i) => (
            <motion.li key={r.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * 0.03 } }} exit={{ opacity: 0 }}>
              <Link href={`/t/${r.poster.kind}/${r.poster.tmdbId}`} className="flex items-center gap-4 py-3 transition-colors hover:bg-ink-2">
                <div className="grid h-16 w-11 shrink-0 place-items-center overflow-hidden bg-ink-3 font-display text-xl font-extrabold text-bone/15">
                  {r.poster.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.poster.poster} alt="" className="size-full object-cover" />
                  ) : (
                    r.poster.name.charAt(0)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{r.poster.name}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[11px] uppercase text-dim">
                    <span>{new Date(r.at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                    <span className="text-bone/70">{prefLabel(r.prefs)}</span>
                  </p>
                </div>
                <StatusMark status={r.status} reason={r.reason} />
              </Link>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </>
  );
}

function Settings({ handle, age, sex, hasPhone, optIn }: { handle: string; age: string; sex: string; hasPhone: boolean; optIn: boolean }) {
  const [p, saveP] = useActionState(saveProfile, undefined);
  const [w, saveW] = useActionState(saveWhatsApp, undefined);
  const [d, del] = useActionState(deleteAccount, undefined);
  const [a, setA] = useState(age);
  const [s, setS] = useState(sex);
  const [danger, setDanger] = useState(false);

  return (
    <div className="grid max-w-5xl gap-16 md:grid-cols-2">
      <form action={saveP} className="space-y-7">
        <h3 className="font-display text-lg font-semibold">Profil</h3>
        <Field label="Pseudo" name="handle" defaultValue={handle} required minLength={3} maxLength={20} autoComplete="username" />
        <input type="hidden" name="age" value={a} />
        <input type="hidden" name="sex" value={s} />
        <Choice name="age-ui" label="Âge" value={a} onChange={setA} options={ageBrackets.map((x) => ({ value: x, label: x }))} />
        <Choice name="sex-ui" label="Genre" value={s} onChange={setS} options={[...sexes, { value: "", label: "Passer" }]} />
        <FormError message={p?.error} />
        <Submit>{p?.ok ? "✓" : "Enregistrer"}</Submit>
      </form>

      <form action={saveW} className="space-y-7">
        <h3 className="font-display text-lg font-semibold">WhatsApp</h3>
        <Field label={hasPhone ? "Nouveau numéro" : "Numéro"} name="phone" type="tel" inputMode="tel" autoComplete="tel" />
        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" name="optin" defaultChecked={optIn} className="peer sr-only" />
          <span className="relative h-6 w-11 bg-ink-3 transition-colors peer-checked:bg-lime after:absolute after:left-1 after:top-1 after:size-4 after:bg-bone after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-ink" />
          <span className="text-sm">Alertes et avis vocaux</span>
        </label>
        <FormError message={w?.error} />
        <Submit>{w?.ok ? "✓" : "Enregistrer"}</Submit>
      </form>

      <div className="md:col-span-2">
        {!danger ? (
          <button onClick={() => setDanger(true)} className="text-sm text-dim hover:text-coral">
            Supprimer mon compte
          </button>
        ) : (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} action={del} className="max-w-sm space-y-6 border-l-2 border-coral pl-5">
            <Field label="Mot de passe" name="password" type="password" required autoComplete="current-password" />
            <FormError message={d?.error} />
            <Submit tone="coral">Supprimer</Submit>
          </motion.form>
        )}
      </div>
    </div>
  );
}
