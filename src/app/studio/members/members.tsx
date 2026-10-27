"use client";
import { useRouter } from "next/navigation";
import { Fragment, useActionState, useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ban, Check, Pencil, Plus, Search, ShieldCheck, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Dropdown } from "@/components/dropdown";
import { Choice, Field, FormError, Submit } from "@/components/ui";
import { can, roleLabel } from "@/lib/rbac";
import { ageBrackets, sexes } from "@/lib/labels";
import { DEEP_UNLOCK } from "@/lib/deep";
import { approveMember, createMember, deleteMember, setBan, setDeepReview, setRole, updateMember } from "../actions";
import type { Role } from "@/db/schema";

type Row = {
  id: string;
  handle: string;
  role: Role;
  age: string | null;
  sex: string | null;
  country: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  bannedAt: string | null;
  verified: boolean;
  requests: number;
  watched: number;
  reviews: number;
  deep: boolean;
  approved: boolean;
};

const ROLES: Role[] = ["USER", "UPLOADER", "MODERATOR", "DEV"];
const roleColor: Record<Role, string> = { USER: "text-dim", UPLOADER: "text-ice", MODERATOR: "text-lime", DEV: "text-coral" };
const flag = (c: string | null) => (c ? String.fromCodePoint(...[...c].map((x) => 0x1f1a5 + x.charCodeAt(0))) : "");
const since = (iso: string | null) => {
  if (!iso) return "jamais";
  const d = (Date.now() - new Date(iso).getTime()) / 86400_000;
  return d < 1 ? "auj." : `${Math.floor(d)}j`;
};

export function Members({ rows, me, total, staff, q }: { rows: Row[]; me: { id: string; role: Role }; total: number; staff: number; q: string }) {
  const router = useRouter();
  const [term, setTerm] = useState(q);
  const [, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const roleChoices = ROLES.filter((x) => x === "USER" || can.setRole(me.role, "USER", x)).map((x) => ({ value: x, label: roleLabel[x] }));

  // Same buttons in the desktop table and the mobile cards
  const actions = (r: Row) => {
    const self = r.id === me.id;
    const roleOpts = ROLES.filter((x) => x !== r.role && can.setRole(me.role, r.role, x)).map((x) => ({ value: x, label: roleLabel[x] }));
    const banned = Boolean(r.bannedAt);
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {!r.approved &&
          (r.verified ? (
            <button
              onClick={() => start(() => approveMember(r.id))}
              className="notch flex h-10 items-center gap-2 bg-lime px-4 text-sm font-semibold text-ink"
            >
              <Check size={15} /> Valider
            </button>
          ) : (
            <span className="flex h-10 items-center px-2 font-mono text-[11px] uppercase text-dim" title="Mail pas encore confirmé">
              mail
            </span>
          ))}
        <IconBtn
          label={r.deep ? "Analyse : retirer" : r.reviews >= DEEP_UNLOCK ? "Analyse : débloquée" : "Analyse : activer"}
          on={r.deep || r.reviews >= DEEP_UNLOCK}
          onClick={() => start(() => setDeepReview(r.id, !r.deep))}
        >
          <SlidersHorizontal size={15} />
        </IconBtn>
        {(self || can.moderate(me.role, r.role)) && (
          <IconBtn label="Modifier" on={editing === r.id} onClick={() => setEditing(editing === r.id ? null : r.id)}>
            <Pencil size={15} />
          </IconBtn>
        )}
      {!self && (
        <>
          {roleOpts.length > 0 && <Dropdown label="Rôle" options={roleOpts} onPick={(v) => start(() => setRole(r.id, v))} />}
          {can.moderate(me.role, r.role) && (
            <button
              onClick={() => start(() => setBan(r.id, !banned))}
              title={banned ? "Réactiver" : "Bannir"}
              aria-label={banned ? "Réactiver" : "Bannir"}
              className={`grid size-10 place-items-center border transition-colors ${banned ? "border-lime text-lime" : "border-line hover:border-coral hover:text-coral"}`}
            >
              <Ban size={15} />
            </button>
          )}
          {can.moderate(me.role, r.role) &&
            (confirm === r.id ? (
              <button
                onClick={() => start(() => deleteMember(r.id))}
                onBlur={() => setConfirm(null)}
                autoFocus
                className="flex h-10 items-center gap-2 bg-coral px-3 text-sm font-semibold text-ink"
              >
                <Trash2 size={15} /> Supprimer
              </button>
            ) : (
              <IconBtn label="Supprimer" on={false} tone="coral" onClick={() => setConfirm(r.id)}>
                <Trash2 size={15} />
              </IconBtn>
            ))}
        </>
      )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-3">
          <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-6xl">Membres</h1>
          <span className="font-mono text-lime">{total}</span>
          <span className="font-mono text-xs text-dim">staff {staff}</span>
          {rows.some((r) => !r.approved) && (
            <span className="font-mono text-xs text-coral">à valider {rows.filter((r) => r.verified && !r.approved).length}</span>
          )}
          <button
            onClick={() => setCreating(!creating)}
            className={`ml-2 flex h-10 items-center gap-2 px-4 text-sm font-semibold transition-colors ${creating ? "border border-line text-bone" : "notch bg-lime text-ink"}`}
          >
            {creating ? <X size={16} /> : <Plus size={16} />} {creating ? "Fermer" : "Nouveau"}
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/studio/members?q=${encodeURIComponent(term)}`);
          }}
          className="flex w-full items-center gap-3 border-b border-line pb-2 focus-within:border-lime md:w-72"
        >
          <Search size={17} className="text-dim" />
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="@pseudo" className="w-full bg-transparent outline-none placeholder:text-bone/25" />
        </form>
      </div>

      <AnimatePresence>
        {creating && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <CreateForm roles={roleChoices} onDone={() => setCreating(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phone: one card per member */}
      <ul className="divide-y divide-line border-y border-line md:hidden">
        {rows.map((r) => (
          <li key={r.id} className={`space-y-3 py-4 ${r.bannedAt ? "opacity-40" : ""}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 truncate font-mono">
                @{r.handle}
                {r.verified && <ShieldCheck size={13} className="shrink-0 text-lime" />}
              </span>
              <span className={`shrink-0 font-mono text-[11px] uppercase ${roleColor[r.role]}`}>{roleLabel[r.role]}</span>
            </div>
            <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-dim">
              {r.age && <span>{r.age}</span>}
              {r.sex && <span>{r.sex}</span>}
              {r.country && <span>{flag(r.country)} {r.country}</span>}
              <span>{r.requests} dem.</span>
              <span>{r.watched} vus</span>
              <span>{r.reviews} avis</span>
              <span>vu {since(r.lastSeenAt)}</span>
            </p>
            <div className="[&>div]:justify-start">{actions(r)}</div>
            {editing === r.id && (
              <div className="bg-ink-2 p-4">
                <EditForm row={r} onDone={() => setEditing(null)} />
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wider text-dim">
              <th className="py-3 font-normal">Pseudo</th>
              <th className="font-normal">Rôle</th>
              <th className="font-normal">Âge</th>
              <th className="font-normal">Genre</th>
              <th className="font-normal">Pays</th>
              <th className="text-right font-normal">Dem.</th>
              <th className="text-right font-normal">Vus</th>
              <th className="text-right font-normal">Avis</th>
              <th className="text-right font-normal">Vu</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const banned = Boolean(r.bannedAt);
              return (
                <Fragment key={r.id}>
                <motion.tr
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i, 20) * 0.015 }}
                  className={`border-b border-line ${banned ? "opacity-40" : ""}`}
                >
                  <td className="py-3">
                    <span className="flex items-center gap-2">
                      @{r.handle}
                      {r.verified && <ShieldCheck size={13} className="text-lime" />}
                    </span>
                  </td>
                  <td className={`font-mono text-xs uppercase ${roleColor[r.role]}`}>{roleLabel[r.role]}</td>
                  <td className="font-mono text-xs">{r.age ?? ""}</td>
                  <td className="font-mono text-xs">{r.sex ?? ""}</td>
                  <td>{flag(r.country)} <span className="font-mono text-xs text-dim">{r.country}</span></td>
                  <td className="text-right font-mono tabular-nums">{r.requests}</td>
                  <td className="text-right font-mono tabular-nums">{r.watched}</td>
                  <td className="text-right font-mono tabular-nums">{r.reviews}</td>
                  <td className="text-right font-mono text-xs text-dim">{since(r.lastSeenAt)}</td>
                  <td className="py-2 pl-4">
                    {actions(r)}
                  </td>
                </motion.tr>
                {editing === r.id && (
                  <tr className="border-b border-line bg-ink-2">
                    <td colSpan={10} className="p-5">
                      <EditForm row={r} onDone={() => setEditing(null)} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IconBtn({ label, on, onClick, children, tone = "lime" }: { label: string; on: boolean; onClick: () => void; children: React.ReactNode; tone?: "lime" | "coral" }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`grid size-10 place-items-center border transition-colors ${
        on ? "border-lime text-lime" : tone === "coral" ? "border-line hover:border-coral hover:text-coral" : "border-line hover:border-bone/40"
      }`}
    >
      {children}
    </button>
  );
}

const ageOptions = [{ value: "", label: "?" }, ...ageBrackets.map((x) => ({ value: x as string, label: x as string }))];
const sexOptions = [...sexes, { value: "", label: "Passer" }];

function CreateForm({ roles, onDone }: { roles: { value: Role; label: string }[]; onDone: () => void }) {
  const [state, action] = useActionState(createMember, undefined);
  const [role, setRoleV] = useState<Role>("USER");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="mb-10 grid gap-7 border-l-2 border-lime bg-ink-2 p-5 md:grid-cols-3 md:p-8">
      <Field label="Pseudo" name="handle" required minLength={3} maxLength={20} autoComplete="off" />
      <Field label="Email" name="email" type="email" required autoComplete="off" />
      <Field label="Mot de passe" name="password" type="password" required minLength={10} autoComplete="new-password" />
      <Choice name="role" label="Rôle" value={role} onChange={setRoleV} options={roles} />
      <Choice name="age" label="Âge" value={age} onChange={setAge} options={ageOptions} />
      <Choice name="sex" label="Genre" value={sex} onChange={setSex} options={sexOptions} />
      <div className="flex items-center gap-6 md:col-span-3">
        <Submit>Créer</Submit>
        <FormError message={state?.error} />
      </div>
    </form>
  );
}

function EditForm({ row, onDone }: { row: Row; onDone: () => void }) {
  const [state, action] = useActionState(updateMember, undefined);
  const [age, setAge] = useState(row.age ?? "");
  const [sex, setSex] = useState(row.sex ?? "");
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="grid gap-7 md:grid-cols-[1fr_1.4fr_1fr_auto] md:items-end">
      <input type="hidden" name="id" value={row.id} />
      <Field label="Pseudo" name="handle" defaultValue={row.handle} required minLength={3} maxLength={20} autoComplete="off" />
      <Choice name="age" label="Âge" value={age} onChange={setAge} options={ageOptions} />
      <Choice name="sex" label="Genre" value={sex} onChange={setSex} options={sexOptions} />
      <div className="flex items-center gap-4">
        <Submit>Enregistrer</Submit>
      </div>
      <div className="md:col-span-4">
        <FormError message={state?.error} />
      </div>
    </form>
  );
}
