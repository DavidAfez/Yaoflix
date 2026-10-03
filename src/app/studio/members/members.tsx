"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { Ban, Search, ShieldCheck } from "lucide-react";
import { Dropdown } from "@/components/dropdown";
import { can, roleLabel } from "@/lib/rbac";
import { setBan, setRole } from "../actions";
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

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="flex items-baseline gap-4">
          <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-6xl">Membres</h1>
          <span className="font-mono text-lime">{total}</span>
          <span className="font-mono text-xs text-dim">staff {staff}</span>
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

      <div className="overflow-x-auto">
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
              <th className="text-right font-normal">Vu</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const self = r.id === me.id;
              const roleOpts = ROLES.filter((x) => x !== r.role && can.setRole(me.role, r.role, x)).map((x) => ({ value: x, label: roleLabel[x] }));
              const banned = Boolean(r.bannedAt);
              return (
                <motion.tr
                  key={r.id}
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
                  <td className="text-right font-mono text-xs text-dim">{since(r.lastSeenAt)}</td>
                  <td className="py-2 pl-4">
                    {!self && (
                      <div className="flex justify-end gap-2">
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
                      </div>
                    )}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
