"use client";
import { useEffect, useRef } from "react";
import { animate, useInView } from "motion/react";

export function Stat({ label, value, decimals = 0, unit }: { label: string; value: number; decimals?: number; unit?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const ctl = animate(0, value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => ref.current && (ref.current.textContent = v.toFixed(decimals)),
    });
    return () => ctl.stop();
  }, [inView, value, decimals]);
  return (
    <div className="min-w-0 bg-ink py-3 pr-2 md:py-5 md:pr-4">
      <dd className="flex items-baseline gap-1 font-display text-2xl font-semibold tabular-nums md:text-5xl">
        <span ref={ref}>0</span>
        {unit && <span className="font-mono text-[10px] font-normal text-bone/60 md:text-sm">{unit}</span>}
      </dd>
      <dt className="mt-1 truncate font-mono text-[10px] uppercase tracking-wider text-dim md:text-[11px] md:tracking-widest">{label}</dt>
    </div>
  );
}
