"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";

/** Animated dropdown. Items stagger in, the panel has a lime edge instead of rounded corners. */
export function Dropdown<T extends string>({
  label,
  options,
  onPick,
  tone = "ghost",
  align = "right",
}: {
  label: string;
  options: { value: T; label: string }[];
  onPick: (v: T) => void;
  tone?: "ghost" | "coral";
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex h-10 items-center gap-2 border px-4 text-sm transition-colors ${
          tone === "coral" ? "border-coral/40 text-coral hover:border-coral" : "border-line hover:border-bone/40"
        }`}
      >
        {label}
        <motion.span animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown size={15} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6, clipPath: "inset(0 0 100% 0)" }}
            animate={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }}
            exit={{ opacity: 0, y: -6, clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute top-12 z-40 min-w-52 border-l-2 ${tone === "coral" ? "border-coral" : "border-lime"} bg-ink-3 py-1 shadow-2xl shadow-black/50 ${align === "right" ? "right-0" : "left-0"}`}
          >
            {options.map((o, i) => (
              <motion.li key={o.value} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                <button
                  onClick={() => {
                    setOpen(false);
                    onPick(o.value);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-bone/5"
                >
                  {o.label}
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
