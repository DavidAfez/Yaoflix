"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import type { Credits } from "@/lib/tmdb";

/** Studios, crew and cast, folded by default. */
export function CreditsPanel({ data }: { data: Credits }) {
  const [open, setOpen] = useState(false);
  const studios = [...data.networks, ...data.companies];
  return (
    <section className="mx-4 mt-12 border-y border-line md:mx-10">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between py-5 text-left">
        <span className="font-display text-xl font-semibold tracking-tight md:text-2xl">Crédits</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown size={22} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid gap-x-10 gap-y-5 pb-8 sm:grid-cols-2 lg:grid-cols-3">
              {data.crew.map((c) => (
                <div key={c.job}>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-lime">{c.job}</p>
                  <p className="mt-1">{c.names.join(", ")}</p>
                </div>
              ))}
              {studios.length > 0 && (
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-lime">Studios</p>
                  <p className="mt-1">{studios.join(", ")}</p>
                </div>
              )}
            </div>
            {data.cast.length > 0 && (
              <div className="scrollbar-none flex gap-4 overflow-x-auto pb-8">
                {data.cast.map((p, i) => (
                  <div key={`${p.name}${i}`} className="w-24 shrink-0 md:w-28">
                    <div className="aspect-[2/3] overflow-hidden bg-ink-3">
                      {p.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photo} alt="" loading="lazy" className="size-full object-cover" />
                      ) : (
                        <div className="grid size-full place-items-center font-display text-3xl font-extrabold text-bone/10">{p.name.charAt(0)}</div>
                      )}
                    </div>
                    <p className="mt-2 text-sm leading-tight">{p.name}</p>
                    {p.role && <p className="mt-0.5 truncate text-xs text-dim">{p.role}</p>}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
