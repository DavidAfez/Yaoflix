"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Home, Bookmark, User, Clapperboard, LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import type { Role } from "@/db/schema";

const isStaff = (r: Role) => r !== "USER";

export function Nav({ role, handle }: { role: Role; handle: string }) {
  const path = usePathname();
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
          YAO<span className="text-lime">.</span>
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
        <span className="ml-auto font-mono text-xs text-dim">@{handle}</span>
        <form action={logout} className="ml-5">
          <button aria-label="Déconnexion" title="Déconnexion" className="grid size-9 place-items-center text-dim transition-colors hover:text-coral">
            <LogOut size={17} />
          </button>
        </form>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid border-t border-line bg-ink/90 backdrop-blur-xl md:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)`, paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.map((it) => {
          const on = active(it.href);
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className="relative flex h-16 flex-col items-center justify-center gap-1" aria-label={it.label}>
              {on && <motion.span layoutId="nav-mob" className="absolute inset-x-5 top-0 h-0.5 bg-lime" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <motion.span animate={{ y: on ? -1 : 0, scale: on ? 1.08 : 1 }}>
                <Icon size={21} strokeWidth={on ? 2.2 : 1.6} className={on ? "text-lime" : "text-dim"} />
              </motion.span>
              <span className={`text-[10px] tracking-wider ${on ? "text-bone" : "text-dim"}`}>{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
