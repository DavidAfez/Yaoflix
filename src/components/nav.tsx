"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Home, Bookmark, User, Clapperboard, LogOut, Search, Bug, MessagesSquare, Mail } from "lucide-react";
import { SearchOverlay } from "./search";
import { useT } from "./i18n";
import { AlertsButton, NotificationBell, useNotifications } from "./studio-bell";
import { logout } from "@/app/(auth)/actions";
import type { Role } from "@/db/schema";

const isStaff = (r: Role) => r !== "USER";

export function Nav({ role, handle }: { role: Role; handle: string }) {
  const path = usePathname();
  const t = useT();
  const notifs = useNotifications();
  const pending = notifs.studio.reduce((a, b) => a + b.count, 0);
  const [searching, setSearching] = useState(false);
  const close = useCallback(() => setSearching(false), []);
  // Search lives behind its icon on every page, home included
  const openSearch = useCallback(() => setSearching(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch]);

  if (path.startsWith("/w/")) return null;

  const items = [
    { href: "/", label: t("Accueil"), icon: Home },
    { href: "/feed", label: "Feed", icon: MessagesSquare },
    { href: "/chat", label: t("Messages"), icon: Mail },
    { href: "/list", label: t("Liste"), icon: Bookmark },
    { href: "/me", label: t("Profil"), icon: User },
    ...(isStaff(role) ? [{ href: "/studio", label: "Studio", icon: Clapperboard }] : []),
  ];
  const active = (href: string) =>
    href === "/" ? path === "/" || path.startsWith("/t/") : href === "/feed" ? path.startsWith("/feed") || path.startsWith("/p/") || path.startsWith("/u/") : path.startsWith(href);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 hidden h-12 items-center border-b border-line bg-ink/80 px-8 backdrop-blur-xl md:flex">
        <Link href="/" className="font-display text-lg font-extrabold tracking-tight">
          GABAOFLIX<span className="text-lime">.</span>
        </Link>
        <nav className="ml-auto flex gap-8">
          {items.map((it) => (
            <Link key={it.href} href={it.href} className="relative py-3.5 text-sm tracking-wide">
              <span className={active(it.href) ? "text-bone" : "text-dim transition-colors hover:text-bone"}>{it.label}</span>
              {it.href === "/chat" && notifs.chat > 0 && <span className="absolute -right-2 top-3 size-1.5 bg-lime" />}
              {active(it.href) && (
                <motion.span layoutId="nav-desk" className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
              )}
            </Link>
          ))}
        </nav>
        <span className="mx-5 h-5 w-px bg-line" />
        <button
          type="button"
          onClick={openSearch}
          aria-label={t("Rechercher")}
          title={`${t("Rechercher")}  /`}
          className="grid size-9 place-items-center text-dim transition-colors hover:text-lime"
        >
          <Search size={17} />
        </button>
        <span className="ml-2 font-mono text-xs text-dim">@{handle}</span>
        <AlertsButton n={notifs} className="ml-1" />
        <NotificationBell n={notifs} className="ml-1" />
        <Link
          href={`/bug?from=${encodeURIComponent(path)}`}
          aria-label={t("Signaler un bug")}
          title={t("Signaler un bug")}
          className="grid size-9 place-items-center text-dim transition-colors hover:text-lime"
        >
          <Bug size={17} />
        </Link>
        <form action={logout} className="ml-1">
          <button aria-label={t("Déconnexion")} title={t("Déconnexion")} className="grid size-9 place-items-center text-dim transition-colors hover:text-coral">
            <LogOut size={17} />
          </button>
        </form>
      </header>

      {/* Phones: a thin top bar for the brand, search and notifications */}
      <header className="fixed inset-x-0 top-0 z-50 flex h-11 items-center gap-1 border-b border-line bg-ink/90 pl-4 pr-1.5 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden">
        <Link href="/" className="font-display text-base font-extrabold tracking-tight">
          GABAOFLIX<span className="text-lime">.</span>
        </Link>
        <button type="button" onClick={openSearch} aria-label={t("Rechercher")} className="ml-auto grid size-9 place-items-center text-dim hover:text-lime">
          <Search size={18} />
        </button>
        <AlertsButton n={notifs} />
        <NotificationBell n={notifs} />
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid border-t border-line bg-ink/90 backdrop-blur-xl md:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)`, paddingBottom: "env(safe-area-inset-bottom)" }}
      >

        {items.map((it) => {
          const on = active(it.href);
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className="relative flex h-14 flex-col items-center justify-center gap-0.5" aria-label={it.label}>
              {on && <motion.span layoutId="nav-mob" className="absolute inset-x-5 top-0 h-0.5 bg-lime" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <motion.span animate={{ y: on ? -1 : 0, scale: on ? 1.08 : 1 }} className="relative">
                {it.href === "/chat" && notifs.chat > 0 && <span className="absolute -right-1.5 -top-1 size-2 bg-lime" />}
                {it.href === "/studio" && pending > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 grid min-w-4 place-items-center bg-lime px-1 font-mono text-[9px] font-semibold leading-4 text-ink">
                    {pending > 99 ? "99+" : pending}
                  </span>
                )}
                <Icon size={19} strokeWidth={on ? 2.2 : 1.6} className={on ? "text-lime" : "text-dim"} />
              </motion.span>
              <span className={`text-[10px] tracking-wider ${on ? "text-bone" : "text-dim"}`}>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <SearchOverlay open={searching} onClose={close} />
    </>
  );
}
