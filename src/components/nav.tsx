"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Home, Bookmark, User, Clapperboard, LogOut, Search } from "lucide-react";
import { SearchOverlay } from "./search";
import { logout } from "@/app/(auth)/actions";
import type { Role } from "@/db/schema";

const isStaff = (r: Role) => r !== "USER";

export function Nav({ role, handle }: { role: Role; handle: string }) {
  const path = usePathname();
  const [searching, setSearching] = useState(false);
  const close = useCallback(() => setSearching(false), []);
  // The home page has its own big bar: focus it rather than stacking an overlay
  const openSearch = useCallback(() => {
    if (path === "/") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      window.dispatchEvent(new Event("gf:search"));
    } else setSearching(true);
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName ?? "");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && path !== "/")) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch, path]);

  if (path.startsWith("/w/")) return null;

  const items = [
    { href: "/", label: "Accueil", icon: Home },
    { href: "/list", label: "Liste", icon: Bookmark },
    { href: "/me", label: "Moi", icon: User },
    ...(isStaff(role) ? [{ href: "/studio", label: "Studio", icon: Clapperboard }] : []),
  ];
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/t/") : path.startsWith(href));

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 hidden h-16 items-center border-b border-line bg-ink/80 px-8 backdrop-blur-xl md:flex">
        <Link href="/" className="font-display text-lg font-extrabold tracking-tight">
          GABAOFLIX<span className="text-lime">.</span>
        </Link>
        <nav className="ml-14 flex gap-9">
          {items.map((it) => (
            <Link key={it.href} href={it.href} className="relative py-5 text-sm tracking-wide">
              <span className={active(it.href) ? "text-bone" : "text-dim transition-colors hover:text-bone"}>{it.label}</span>
              {active(it.href) && (
                <motion.span layoutId="nav-desk" className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
              )}
            </Link>
          ))}
        </nav>
        {/* The home page already has its big search bar */}
        {path !== "/" && (
          <button
            type="button"
            onClick={openSearch}
            className="ml-auto flex h-10 w-72 items-center gap-3 border border-line px-3 text-sm text-bone/40 transition-colors hover:border-lime hover:text-bone lg:w-96"
          >
            <Search size={16} className="text-lime" />
            Un film, une série, @membre
            <kbd className="ml-auto font-mono text-[11px] text-dim">/</kbd>
          </button>
        )}
        <span className={`${path === "/" ? "ml-auto" : "ml-6"} font-mono text-xs text-dim`}>@{handle}</span>
        <form action={logout} className="ml-5">
          <button aria-label="Déconnexion" title="Déconnexion" className="grid size-9 place-items-center text-dim transition-colors hover:text-coral">
            <LogOut size={17} />
          </button>
        </form>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid border-t border-line bg-ink/90 backdrop-blur-xl md:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length + 1}, 1fr)`, paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <button type="button" onClick={openSearch} className="relative order-1 flex h-16 flex-col items-center justify-center gap-1" aria-label="Chercher">
          <Search size={21} strokeWidth={searching ? 2.2 : 1.6} className={searching ? "text-lime" : "text-dim"} />
          <span className={`text-[10px] tracking-wider ${searching ? "text-bone" : "text-dim"}`}>Chercher</span>
        </button>
        {items.map((it) => {
          const on = active(it.href);
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className={`relative flex h-16 flex-col items-center justify-center gap-1 ${it.href === "/" ? "order-0" : "order-2"}`} aria-label={it.label}>
              {on && <motion.span layoutId="nav-mob" className="absolute inset-x-5 top-0 h-0.5 bg-lime" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <motion.span animate={{ y: on ? -1 : 0, scale: on ? 1.08 : 1 }}>
                <Icon size={21} strokeWidth={on ? 2.2 : 1.6} className={on ? "text-lime" : "text-dim"} />
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
