"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AtSign, Bell, Check, Clapperboard, Sparkles, Heart, MessageCircle, MonitorSmartphone, Repeat2, UserPlus, X } from "lucide-react";
import { useLocale, useT } from "./i18n";
import { rejectLabels } from "@/lib/labels";
import type { RejectReason } from "@/db/schema";
import type { T } from "@/lib/i18n";

export type StudioNotif = { key: string; label: string; count: number; href: string };
type Item = { id: number; kind: string; data: { title?: string; handle?: string; href?: string; reason?: string }; readAt: string | null; at: string };
type Payload = { items: Item[]; unread: number; chat: number; devices: number; studio: StudioNotif[] };

/** Notification centre data, refreshed on every page change and every minute. */
export function useNotifications() {
  const path = usePathname();
  const [data, setData] = useState<Payload>({ items: [], unread: 0, chat: 0, devices: 0, studio: [] });
  const load = useCallback(() => {
    fetch("/api/notifications")
      .then((r) => (r.ok ? (r.json() as Promise<Payload>) : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load, path]);
  const markRead = useCallback(() => {
    if (!data.unread) return;
    setData((d) => ({ ...d, unread: 0 }));
    void fetch("/api/notifications", { method: "POST" });
  }, [data.unread]);
  return { ...data, markRead, total: data.unread + data.devices + data.studio.reduce((a, b) => a + b.count, 0) };
}

const ICON: Record<string, React.ReactNode> = {
  ready: <Check size={15} className="text-lime" />,
  new: <Sparkles size={15} className="text-lime" />,
  creator: <Clapperboard size={15} className="text-lime" />,
  rejected: <X size={15} className="text-coral" />,
  reply: <MessageCircle size={15} className="text-ice" />,
  follow: <UserPlus size={15} className="text-ice" />,
  fav: <Heart size={15} className="text-coral" fill="currentColor" />,
  repost: <Repeat2 size={15} className="text-lime" />,
};

function line(it: Item, t: T) {
  const d = it.data;
  switch (it.kind) {
    case "ready":
      return t("{title} est dispo", { title: d.title ?? "" });
    case "new":
      return t("Nouveau : {title}", { title: d.title ?? "" });
    case "creator":
      return t("Ton profil créateur est validé");
    case "rejected":
      return `${d.title} : ${t(rejectLabels[d.reason as RejectReason] ?? "Refusé")}`;
    case "reply":
      return t("@{h} a répondu à ton post", { h: d.handle ?? "" });
    case "follow":
      return t("@{h} te suit", { h: d.handle ?? "" });
    case "fav":
      return t("@{h} a aimé ton post", { h: d.handle ?? "" });
    case "repost":
      return t("@{h} a reposté ton post", { h: d.handle ?? "" });
    default:
      return "";
  }
}

export function NotificationBell({ n, className = "", align = "right" }: { n: ReturnType<typeof useNotifications>; className?: string; align?: "right" | "left" }) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const ago = (iso: string) => {
    const m = (Date.now() - new Date(iso).getTime()) / 60_000;
    if (m < 60) return `${Math.max(1, Math.floor(m))} min`;
    if (m < 1440) return `${Math.floor(m / 60)} h`;
    return new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "short" });
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(n.markRead, 1200);
        }}
        aria-label={t("Notifications")}
        title={t("Notifications")}
        className={`relative grid size-9 place-items-center transition-colors ${open ? "text-lime" : "text-dim hover:text-bone"}`}
      >
        <Bell size={17} />
        {n.total > 0 && (
          <motion.span key={n.total} initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center bg-lime px-1 font-mono text-[10px] font-semibold leading-4 text-ink">
            {n.total > 99 ? "99+" : n.total}
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
            className={`absolute top-11 z-50 max-h-[70vh] w-80 overflow-y-auto border-l-2 border-lime bg-ink-2 py-1 shadow-2xl shadow-black/60 ${align === "right" ? "right-0" : "left-0"}`}
          >
            {n.devices > 0 && (
              <Link href="/chat" onClick={() => setOpen(false)} className="flex items-center gap-3 border-b border-line px-4 py-3 text-sm text-bone transition-colors hover:bg-bone/5 hover:text-lime">
                <MonitorSmartphone size={15} className="shrink-0 text-lime" />
                {t("Un nouvel appareil veut accéder à tes messages")}
              </Link>
            )}
            {n.studio.length > 0 && (
              <div className="border-b border-line pb-1">
                <p className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-lime">{t("Studio")}</p>
                {n.studio.map((it) => (
                  <Link key={it.key} href={it.href} onClick={() => setOpen(false)} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm transition-colors hover:bg-bone/5 hover:text-lime">
                    {t(it.label)}
                    <span className="font-mono text-xs tabular-nums text-lime">{it.count}</span>
                  </Link>
                ))}
              </div>
            )}
            {n.items.length === 0 && !n.studio.length && !n.devices ? (
              <p className="px-4 py-6 text-center text-sm text-dim">{t("Rien de neuf.")}</p>
            ) : (
              n.items.map((it) => (
                <Link
                  key={it.id}
                  href={it.data.href ?? "/me"}
                  onClick={() => setOpen(false)}
                  className={`flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-bone/5 ${it.readAt ? "text-bone/70" : "text-bone"}`}
                >
                  <span className="mt-0.5 shrink-0">{ICON[it.kind] ?? <AtSign size={15} />}</span>
                  <span className="min-w-0 flex-1">{line(it, t)}</span>
                  <span className="shrink-0 font-mono text-[10px] text-dim">{ago(it.at)}</span>
                  {!it.readAt && <span className="mt-1.5 size-1.5 shrink-0 bg-lime" />}
                </Link>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
