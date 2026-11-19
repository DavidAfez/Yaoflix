"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Engagement } from "@/lib/engagement-stats";
import { tierLabel, type Tier } from "@/lib/trophy-defs";
import { useT } from "@/components/i18n";
import { TIER_COLOR } from "@/components/trophies";
import { AXIS, Count, GRID, Panel, S, Tip } from "../insights/dashboard";

const FEATURE: Record<string, { label: string; what: string }> = {
  welcome: { label: "Retour après absence", what: "Le résumé de ce qui s'est passé, après 5 jours sans venir" },
  pick: { label: "Choix du jour", what: "Un titre par jour, prêt ou dans les goûts du membre" },
  near: { label: "Trophée à portée", what: "Le trophée le plus proche, aux deux tiers du chemin" },
  trophy: { label: "Trophées", what: "La célébration quand un trophée tombe" },
};

const pct = (x: number | null, d = 0) => (x === null ? "–" : `${(x * 100).toFixed(d)} %`);
const num = (x: number | null, d = 1) => (x === null ? "–" : x.toFixed(d));

/** How the site is used, and whether the nudges and trophies make members come back. */
export function EngagementBoard({ data, days }: { data: Engagement; days: number }) {
  const t = useT();
  const a = data.activity;
  const daily = data.daily.map((d) => ({ ...d, label: d.day.slice(5).split("-").reverse().join("/") }));
  const e = data.experiment;
  const enough = e.test.n >= 20 && e.holdout.n >= 20;
  const verdict = !enough
    ? t("Pas encore assez de membres pour conclure : il en faut une vingtaine par groupe.")
    : e.p !== null && e.p < 0.05
      ? t("Différence nette (p = {p}) : les mécanismes changent quelque chose.", { p: e.p.toFixed(3) })
      : t("Pas de différence nette pour l'instant (p = {p}).", { p: e.p === null ? "–" : e.p.toFixed(2) });

  return (
    <div className="pb-20">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-6xl">{t("Engagement")}</h1>
        <div className="flex border-b border-line">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/studio/engagement?d=${d}`} scroll={false} className={`relative px-4 py-2 font-mono text-sm ${d === days ? "text-bone" : "text-dim hover:text-bone"}`}>
              {d}j
              {d === days && <motion.span layoutId="range" className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" />}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-5">
        {[
          { label: "Actifs 24 h", v: a.dau },
          { label: "Actifs 7 j", v: a.wau },
          { label: "Actifs 30 j", v: a.mau },
          { label: "Fidélité", v: (a.stickiness ?? 0) * 100, d: 0, suffix: "%", hint: "Actifs du jour sur actifs du mois" },
          { label: "Minutes par jour", v: a.minutes ?? 0, d: 1, hint: "Temps visible, par membre et par jour de visite" },
        ].map((x) => (
          <div key={x.label} className="bg-ink p-5" title={x.hint ? t(x.hint) : undefined}>
            <p className="font-mono text-[11px] uppercase tracking-widest text-dim">{t(x.label)}</p>
            <p className="mt-3 font-display text-3xl font-semibold tabular-nums md:text-4xl">
              <Count to={x.v} decimals={x.d} suffix={x.suffix} />
            </p>
          </div>
        ))}
      </div>

      <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-14 lg:grid-cols-2">
        <Panel title="Membres actifs par jour" className="lg:col-span-2">
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={daily} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<Tip />} cursor={{ stroke: "rgb(243 240 232 / .25)" }} />
                <Line type="monotone" dataKey="users" name={t("Actifs")} stroke={S[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#131316", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Rétention par semaine d'arrivée" className="lg:col-span-2">
          {data.cohorts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-px font-mono text-xs">
                <thead>
                  <tr className="text-dim">
                    <th className="p-2 text-left font-normal">{t("Arrivés la semaine du")}</th>
                    <th className="p-2 text-right font-normal">{t("Membres")}</th>
                    {Array.from({ length: 8 }, (_, k) => (
                      <th key={k} className="p-2 text-center font-normal">
                        S{k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((c) => (
                    <tr key={c.cohort}>
                      <td className="p-2">{c.cohort.split("-").reverse().join("/")}</td>
                      <td className="p-2 text-right tabular-nums">{c.size}</td>
                      {c.weeks.map((w, k) => (
                        <td key={k} className="p-2 text-center tabular-nums" style={{ background: w === null ? "transparent" : `rgb(226 98 107 / ${0.08 + w * 0.7})` }}>
                          {w === null ? "" : `${Math.round(w * 100)}`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-dim">{t("Part des arrivants d'une semaine revenus la semaine S0, S1, S2…, en %.")}</p>
            </div>
          ) : (
            <p className="text-sm text-dim">{t("Pas encore d'arrivées sur les 8 dernières semaines.")}</p>
          )}
        </Panel>

        <Panel title="Ce que donne chaque mécanisme">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] text-dim">
                <th className="py-2 font-normal">{t("Mécanisme")}</th>
                <th className="py-2 text-right font-normal">{t("Vu")}</th>
                <th className="py-2 text-right font-normal">{t("Membres")}</th>
                <th className="py-2 text-right font-normal">{t("Clics")}</th>
                <th className="py-2 text-right font-normal">{t("Taux")}</th>
              </tr>
            </thead>
            <tbody>
              {data.features.map((f) => (
                <tr key={f.feature} className="border-b border-line/60" title={t(FEATURE[f.feature].what)}>
                  <td className="py-2.5">
                    {t(FEATURE[f.feature].label)}
                    {f.feature === "trophy" && <span className="ml-2 font-mono text-[11px] text-dim">{t("{n} gagnés", { n: f.unlocks })}</span>}
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{f.shown}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{f.reached}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{f.clicks}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-lime">{pct(f.ctr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-dim">{t("Un affichage compte une fois par jour et par membre, quand le bloc est vraiment à l'écran.")}</p>
        </Panel>

        <Panel title="Avec ou sans les mécanismes">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-2 text-sm">
            <span />
            <span className="text-right font-mono text-[11px] text-dim">{t("Avec")}</span>
            <span className="text-right font-mono text-[11px] text-dim">{t("Sans ({s} %)", { s: e.share })}</span>
            {[
              { label: "Membres", a: String(e.test.n), b: String(e.holdout.n) },
              { label: "Revenus dans les 7 jours", a: pct(e.test.rate), b: pct(e.holdout.rate) },
              { label: "Visites par membre (28 j)", a: num(e.test.sessions), b: num(e.holdout.sessions) },
              { label: "Minutes par membre (28 j)", a: num(e.test.minutes, 0), b: num(e.holdout.minutes, 0) },
            ].map((r) => (
              <div key={r.label} className="contents">
                <span className="text-dim">{t(r.label)}</span>
                <span className="text-right font-mono tabular-nums">{r.a}</span>
                <span className="text-right font-mono tabular-nums">{r.b}</span>
              </div>
            ))}
          </div>
          <p className={`mt-4 border-l-2 pl-3 text-sm ${enough && e.p !== null && e.p < 0.05 ? "border-lime" : "border-line text-dim"}`}>{verdict}</p>
          <p className="mt-3 text-xs text-dim">
            {t("Le groupe « sans » est tiré au hasard et ne voit ni le retour après absence, ni le choix du jour, ni le trophée à portée. Les trophées restent visibles pour tous.")}
          </p>
        </Panel>

        <Panel title="Rareté des trophées" className="lg:col-span-2">
          <ul className="grid gap-x-10 gap-y-2 md:grid-cols-2">
            {data.trophies.map((tr) => (
              <li key={tr.id} className="flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0 truncate">{t(tr.name)}</span>
                <span className="h-1.5 flex-1 bg-bone/10">
                  <span className="block h-full" style={{ width: `${tr.share * 100}%`, background: TIER_COLOR[tr.tier as Tier] }} />
                </span>
                <span className="w-24 shrink-0 text-right font-mono text-[11px] tabular-nums text-dim">
                  {tr.n} · {t(tierLabel[tr.tier as Tier])}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
