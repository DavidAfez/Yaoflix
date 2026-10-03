"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

export function StudioNav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  const active = (h: string) => (h === "/studio" ? path === h : path.startsWith(h));
  return (
    <nav className="scrollbar-none sticky top-0 z-30 flex items-center gap-8 overflow-x-auto border-b border-line bg-ink/90 px-4 backdrop-blur md:top-16 md:px-10">
      <span className="shrink-0 font-display text-sm font-extrabold text-lime">STUDIO</span>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={`relative shrink-0 py-4 text-sm ${active(l.href) ? "text-bone" : "text-dim hover:text-bone"}`}>
          {l.label}
          {active(l.href) && <motion.span layoutId="studio-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" />}
        </Link>
      ))}
    </nav>
  );
}
