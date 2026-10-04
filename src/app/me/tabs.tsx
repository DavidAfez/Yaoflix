"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Poster, type PosterData } from "@/components/poster";
import { Choice, Field, Submit, FormError } from "@/components/ui";
import { StatusMark } from "@/components/status";
import { ageBrackets, sexes } from "@/lib/labels";
import { saveProfile, saveWhatsApp, deleteAccount } from "./actions";
import type { RejectReason } from "@/db/schema";

type Req = { id: string; status: "PENDING" | "IN_PROGRESS" | "FULFILLED" | "REJECTED"; reason: RejectReason | null; at: string; poster: PosterData };

const TABS = ["Pour toi", "Aimés", "Demandes", "Réglages"] as const;

export function MeTabs(props: {
  recos: PosterData[];
  toAsk: PosterData[];
  liked: PosterData[];
  requests: Req[];
  profile: { handle: string; age: string; sex: string; hasPhone: boolean; optIn: boolean };
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Pour toi");
  return (
    <>
      <nav className="scrollbar-none sticky top-0 z-20 -mx-4 flex gap-8 overflow-x-auto border-b border-line bg-ink/90 px-4 backdrop-blur md:top-16 md:-mx-10 md:px-10">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`relative shrink-0 py-5 text-sm ${tab === t ? "text-bone" : "text-dim hover:text-bone"}`}>
            {t}
            {tab === t && <motion.span layoutId="me-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" />}
          </button>
        ))}
      </nav>
      <AnimatePresence mode="wait">
        <motion.section key={tab} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="pt-8">
          {tab === "Pour toi" && (
            <>
              <Grid items={props.recos} empty="Rien encore." />
              {props.toAsk.length > 0 && (
                <>
                  <h2 className="mb-5 mt-14 font-display text-xl font-semibold">À demander</h2>
                  <Grid items={props.toAsk} />
                </>
              )}
            </>
          )}
          {tab === "Aimés" && <Grid items={props.liked} empty="Rien encore." />}
          {tab === "Demandes" && <Requests items={props.requests} />}
          {tab === "Réglages" && <Settings {...props.profile} />}
        </motion.section>
      </AnimatePresence>
    </>
  );
}

function Grid({ items, empty }: { items: PosterData[]; empty?: string }) {
  if (!items.length) return <p className="py-16 text-center font-display text-2xl text-bone/20">{empty}</p>;
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-6 md:gap-x-5 xl:grid-cols-8 [&>*]:w-auto">
      {items.map((p, i) => (
        <Poster key={`${p.kind}${p.tmdbId}`} t={p} i={i} />
      ))}
    </div>
  );
}

function Requests({ items }: { items: Req[] }) {
  if (!items.length) return <p className="py-16 text-center font-display text-2xl text-bone/20">Aucune.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((r, i) => (
        <motion.li key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
          <Link href={`/t/${r.poster.kind}/${r.poster.tmdbId}`} className="flex items-center gap-4 py-3 hover:bg-ink-2">
            {r.poster.poster && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.poster.poster} alt="" className="h-16 w-11 object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate">{r.poster.name}</p>
              <p className="font-mono text-[11px] text-dim">{new Date(r.at).toLocaleDateString("fr-FR")}</p>
            </div>
            <StatusMark status={r.status} reason={r.reason} />
          </Link>
        </motion.li>
      ))}
    </ul>
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
