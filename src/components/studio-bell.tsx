"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell } from "lucide-react";
import { useT } from "./i18n";
export type StudioNotif = { key: string; label: string; count: number; href: string };

/** Staff inbox: refreshed on every page change and every minute. */
export function useStudioNotifs(enabled: boolean) {
  const path = usePathname();
  const [items, setItems] = useState<StudioNotif[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    const load = () =>
      fetch("/api/studio/notifs")
        .then((r) => (r.ok ? (r.json() as Promise<{ items: StudioNotif[] }>) : { items: [] }))
        .then((d) => !stale && setItems(d.items))
        .catch(() => {});
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      stale = true;
      clearInterval(t);
    };
  }, [enabled, path]);
  return items;
}

export function StudioBell({ items }: { items: StudioNotif[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const total = items.reduce((a, b) => a + b.count, 0);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label={t("Notifications du studio")}
        title={t("Notifications du studio")}
        className={`relative grid size-9 place-items-center transition-colors ${open ? "text-lime" : "text-dim hover:text-bone"}`}
      >
        <Bell size={17} />
        {total > 0 && (
          <motion.span
            key={total}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center bg-lime px-1 font-mono text-[10px] font-semibold leading-4 text-ink"
          >
            {total > 99 ? "99+" : total}
          </motion.span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 w-72 border-l-2 border-lime bg-ink-2 py-1 shadow-2xl shadow-black/60"
          >
            {items.length === 0 ? (
              <p className="px-4 py-4 text-sm text-dim">{t("Rien à faire.")}</p>
            ) : (
              items.map((it) => (
                <Link key={it.key} href={it.href} onClick={() => setOpen(false)} className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-bone/5 hover:text-lime">
                  {t(it.label)}
                  <span className="font-mono text-xs tabular-nums text-lime">{it.count}</span>
                </Link>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
