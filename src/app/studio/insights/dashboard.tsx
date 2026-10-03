"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useInView } from "motion/react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Insights } from "@/lib/insights";
import { ageBrackets, recencyOrder, rejectLabels } from "@/lib/labels";
import type { RejectReason } from "@/db/schema";

/** Categorical slots validated against the #131316 surface (CVD + normal vision + contrast). */
const S = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];
const LIME = "#c8ff2e";
const GRID = "rgb(243 240 232 / 0.06)";
const AXIS = { fill: "#8c8a84", fontSize: 11, fontFamily: "var(--font-geist-mono)" };

const sexLabel: Record<string, string> = { F: "Femmes", M: "Hommes", X: "Autres", "?": "N/C" };
const deviceLabel: Record<string, string> = { mobile: "Mobile", tablet: "Tablette", desktop: "Ordi", tv: "TV", "?": "N/C" };

function Count({ to, decimals = 0, suffix = "" }: { to: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const ctl = animate(0, to, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => ref.current && (ref.current.textContent = v.toFixed(decimals) + suffix),
    });
    return () => ctl.stop();
  }, [inView, to, decimals, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

function Panel({ title, children, className = "", i = 0 }: { title: string; children: React.ReactNode; className?: string; i?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: (i % 3) * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`border-t border-line pt-5 ${className}`}
    >
      <h2 className="mb-5 font-display text-base font-semibold tracking-tight">{title}</h2>
      {children}
    </motion.section>
  );
}

function Tip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-l-2 border-lime bg-ink-3 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-mono text-dim">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="size-2" style={{ background: p.color }} />
          <span className="text-bone/80">{p.name}</span>
          <span className="ml-auto pl-4 font-mono tabular-nums text-bone">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-bone/80">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="size-2" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Ranked list with inline bars. Text stays in ink, the bar carries the value. */
function Bars({ rows, color = LIME, unit = "" }: { rows: { label: string; value: number; extra?: string }[]; color?: string; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty />;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.label} className="group grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm" title={`${r.label} : ${r.value}${unit}`}>
          <span className="truncate text-bone/80">{r.label}</span>
          <span className="relative h-2 bg-bone/5">
            <motion.span
              className="absolute inset-y-0 left-0 rounded-r-[2px]"
              style={{ background: color }}
              initial={{ width: 0 }}
              whileInView={{ width: `${(r.value / max) * 100}%` }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
          <span className="font-mono text-xs tabular-nums text-bone">
            {r.value}
            {unit}
            {r.extra && <span className="ml-2 text-dim">{r.extra}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const Empty = () => <p className="py-10 text-center font-mono text-xs text-dim">0</p>;

export function Dashboard({ data, days }: { data: Insights; days: number }) {
  const k = data.kpi;
  const servedRate = k.served + k.rejected ? (k.served / (k.served + k.rejected)) * 100 : 0;

  const daily = data.daily.map((d) => ({ ...d, label: d.day.slice(5).split("-").reverse().join("/") }));

  // Genre x age heatmap, normalised per age bracket so small cohorts still show their taste
  const heat = useMemo(() => {
    const ages = [...ageBrackets, "?"].filter((a) => data.genreAge.some((g) => g.age === a));
    const totals = new Map<string, number>();
    data.genreAge.forEach((g) => totals.set(g.genre, (totals.get(g.genre) ?? 0) + g.n));
    const genres = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([g]) => g);
    const perAge = new Map<string, number>();
    data.genreAge.forEach((g) => perAge.set(g.age, (perAge.get(g.age) ?? 0) + g.n));
    const cell = (genre: string, age: string) => {
      const n = data.genreAge.find((x) => x.genre === genre && x.age === age)?.n ?? 0;
      return { n, share: n / Math.max(1, perAge.get(age) ?? 0) };
    };
    const max = Math.max(0.0001, ...genres.flatMap((g) => ages.map((a) => cell(g, a).share)));
    return { ages, genres, cell, max };
  }, [data.genreAge]);

  const sexes = ["F", "M", "X"].filter((s) => data.genreSex.some((g) => g.sex === s));
  const genreSex = useMemo(() => {
    const tot = new Map<string, number>();
    data.genreSex.forEach((g) => tot.set(g.sex, (tot.get(g.sex) ?? 0) + g.n));
    const byGenre = new Map<string, number>();
    data.genreSex.forEach((g) => byGenre.set(g.genre, (byGenre.get(g.genre) ?? 0) + g.n));
    return [...byGenre.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([genre]) => {
        const row: Record<string, string | number> = { genre };
        for (const s of sexes) {
          const n = data.genreSex.find((x) => x.genre === genre && x.sex === s)?.n ?? 0;
          row[sexLabel[s]] = Math.round((n / Math.max(1, tot.get(s) ?? 0)) * 100);
        }
        return row;
      });
  }, [data.genreSex, sexes]);

  const buckets = recencyOrder.filter((b) => b !== "Inconnu");
  const recency = useMemo(() => {
    const ages = [...ageBrackets, "?"].filter((a) => data.recencyAge.some((r) => r.age === a));
    return ages.map((age) => {
      const rows = data.recencyAge.filter((r) => r.age === age && r.bucket !== "Inconnu");
      const total = rows.reduce((s, r) => s + r.n, 0) || 1;
      const row: Record<string, string | number> = { age };
      buckets.forEach((b) => (row[b] = Math.round(((rows.find((r) => r.bucket === b)?.n ?? 0) / total) * 100)));
      return row;
    });
  }, [data.recencyAge, buckets]);

  const order = (xs: { bucket: string; n: number }[], keys: string[]) => keys.map((b) => ({ label: b, value: xs.find((x) => x.bucket === b)?.n ?? 0 }));

  return (
    <div className="pb-20">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-6xl">Insights</h1>
        <div className="flex border-b border-line">
          {[7, 30, 90, 365].map((d) => (
            <Link key={d} href={`/studio/insights?d=${d}`} scroll={false} className={`relative px-4 py-2 font-mono text-sm ${d === days ? "text-bone" : "text-dim hover:text-bone"}`}>
              {d === 365 ? "1an" : `${d}j`}
              {d === days && <motion.span layoutId="range" className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" />}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Membres", v: k.users, sub: `+${k.new_users}` },
          { label: "En attente", v: k.open },
          { label: "Servies", v: servedRate, d: 0, suffix: "%" },
          { label: "Focus médian", v: (k.focus_median ?? 0) / 60, d: 1, suffix: " min" },
          { label: "Session moy.", v: (k.session_avg ?? 0) / 60, d: 1, suffix: " min" },
          { label: "Vus jusqu'au bout", v: (k.completion ?? 0) * 100, d: 0, suffix: "%" },
        ].map((t) => (
          <div key={t.label} className="bg-ink p-5">
            <p className="font-mono text-[11px] uppercase tracking-widest text-dim">{t.label}</p>
            <p className="mt-3 font-display text-3xl font-semibold tabular-nums md:text-4xl">
              <Count to={t.v} decimals={t.d} suffix={t.suffix} />
            </p>
            {t.sub && <p className="mt-1 font-mono text-xs text-lime">{t.sub}</p>}
          </div>
        ))}
      </div>

      <div className="mt-12 grid gap-x-12 gap-y-14 lg:grid-cols-2">
        <Panel title="Activité" className="lg:col-span-2">
          <Legend items={[{ label: "Demandes", color: S[0] }, { label: "Servies", color: S[1] }, { label: "Lectures", color: S[2] }]} />
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={daily} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<Tip />} cursor={{ stroke: "rgb(243 240 232 / .25)" }} />
                <Line type="monotone" dataKey="requests" name="Demandes" stroke={S[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#131316", strokeWidth: 2 }} />
                <Line type="monotone" dataKey="served" name="Servies" stroke={S[1]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#131316", strokeWidth: 2 }} />
                <Line type="monotone" dataKey="watches" name="Lectures" stroke={S[2]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#131316", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Genres par âge" className="lg:col-span-2" i={1}>
          {heat.genres.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-[2px] text-xs">
                <thead>
                  <tr>
                    <th className="w-36" />
                    {heat.ages.map((a) => (
                      <th key={a} className="pb-2 font-mono font-normal text-dim">{a}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heat.genres.map((g) => (
                    <tr key={g}>
                      <td className="pr-3 text-right text-bone/80">{g}</td>
                      {heat.ages.map((a) => {
                        const c = heat.cell(g, a);
                        const t = c.share / heat.max;
                        return (
                          <td
                            key={a}
                            title={`${g} · ${a} : ${Math.round(c.share * 100)}% (${c.n})`}
                            className="h-9 text-center font-mono tabular-nums transition-[outline] hover:outline hover:outline-1 hover:outline-bone"
                            style={{ background: `color-mix(in oklab, ${LIME} ${Math.round(6 + t * 88)}%, #131316)`, color: t > 0.55 ? "#0b0b0d" : "#f3f0e8" }}
                          >
                            {c.n ? `${Math.round(c.share * 100)}` : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty />
          )}
        </Panel>

        <Panel title="Genres par genre (%)" i={2}>
          {genreSex.length ? (
            <>
              <Legend items={sexes.map((s, i) => ({ label: sexLabel[s], color: S[i] }))} />
              <div style={{ height: Math.max(220, genreSex.length * 38) }}>
                <ResponsiveContainer>
                  <BarChart data={genreSex} layout="vertical" margin={{ left: 0, right: 8 }} barGap={2} barCategoryGap="22%">
                    <CartesianGrid stroke={GRID} horizontal={false} />
                    <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} unit="%" />
                    <YAxis type="category" dataKey="genre" tick={{ ...AXIS, fill: "#f3f0e8cc" }} tickLine={false} axisLine={false} width={124} />
                    <Tooltip content={<Tip />} cursor={{ fill: "rgb(243 240 232 / .04)" }} />
                    {sexes.map((s, i) => (
                      <Bar key={s} dataKey={sexLabel[s]} fill={S[i]} radius={[0, 2, 2, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <Empty />
          )}
        </Panel>

        <Panel title="Récence par âge (%)" i={3}>
          {recency.length ? (
            <>
              <Legend items={buckets.map((b, i) => ({ label: b, color: S[i] }))} />
              <div style={{ height: Math.max(220, recency.length * 40) }}>
                <ResponsiveContainer>
                  <BarChart data={recency} layout="vertical" margin={{ left: 0, right: 8 }} barCategoryGap="28%">
                    <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                    <YAxis type="category" dataKey="age" tick={{ ...AXIS, fill: "#f3f0e8cc" }} tickLine={false} axisLine={false} width={48} />
                    <Tooltip content={<Tip />} cursor={{ fill: "rgb(243 240 232 / .04)" }} />
                    {buckets.map((b, i) => (
                      <Bar key={b} dataKey={b} stackId="r" fill={S[i]} stroke="#0b0b0d" strokeWidth={2} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <Empty />
          )}
        </Panel>

        <Panel title="Concentration entre 2 pauses (min)" i={4}>
          <Bars rows={order(data.focus, ["<5", "5-15", "15-30", "30-60", "60+"])} />
          {data.focusByAge.length > 0 && (
            <table className="mt-8 w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-dim">
                  <th className="pb-2 font-normal">Âge</th>
                  <th className="pb-2 text-right font-normal">Médiane</th>
                  <th className="pb-2 text-right font-normal">Pauses / film</th>
                </tr>
              </thead>
              <tbody>
                {data.focusByAge.map((r) => (
                  <tr key={r.age} className="border-t border-line">
                    <td className="py-2 font-mono">{r.age}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{r.median} min</td>
                    <td className="py-2 text-right font-mono tabular-nums">{r.pauses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Temps par session (min)" i={5}>
          <Bars rows={order(data.sessions, ["<2", "2-10", "10-30", "30-60", "60-120", "120+"])} />
          <div className="mt-8">
            <Bars rows={data.devices.map((d) => ({ label: deviceLabel[d.device] ?? d.device, value: d.n }))} color="#8fe3ff" />
          </div>
        </Panel>

        <Panel title="Pays" i={6}>
          <Bars rows={data.countries.map((c) => ({ label: c.country, value: c.sessions, extra: `${c.minutes} min` }))} />
        </Panel>

        <Panel title="Top titres" i={7}>
          {data.topTitles.length ? (
            <ol className="space-y-2 text-sm">
              {data.topTitles.map((t, i) => (
                <li key={t.name} className="flex items-baseline gap-3 border-b border-line pb-2">
                  <span className="w-5 font-mono text-xs text-lime">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1 truncate">{t.name}</span>
                  <span className="font-mono text-xs tabular-nums text-dim">{t.requests} dem.</span>
                  <span className="w-16 text-right font-mono text-xs tabular-nums">{t.watches} vues</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty />
          )}
        </Panel>

        <Panel title="Refus" i={8}>
          <Bars rows={data.reasons.map((r) => ({ label: rejectLabels[r.reason as RejectReason] ?? r.reason, value: r.n }))} color="#f3f0e8" />
        </Panel>

        <Panel title={`Avis vocaux · ${k.voice}`} i={9}>
          {data.voices.length ? (
            <ul className="space-y-3">
              {data.voices.map((v) => (
                <li key={v.id} className="border-l-2 border-lime/40 pl-3">
                  <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
                    <span className="font-semibold">{v.title ?? "?"}</span>
                    <span className="font-mono text-[11px] text-dim">
                      {v.handle ? `@${v.handle}` : "anonyme"} {v.age ? `· ${v.age}` : ""} · {v.at} {v.source === "whatsapp" ? "· WA" : ""}
                    </span>
                  </p>
                  <audio src={`/api/voice/${v.file}`} controls preload="none" className="mt-1 h-9 w-full" />
                </li>
              ))}
            </ul>
          ) : (
            <Empty />
          )}
        </Panel>
      </div>
    </div>
  );
}
