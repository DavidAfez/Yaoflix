"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Star } from "lucide-react";
import { fmtRating } from "@/lib/rating";
import { useT } from "./i18n";

/** One star filled from 0 to 1, by halves. */
export function StarShape({ fill, size }: { fill: number; size: number }) {
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      <Star size={size} className="absolute inset-0 text-bone/25" />
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
        <Star size={size} className="text-lime" fill="currentColor" />
      </span>
    </span>
  );
}

/**
 * Five stars with halves, Letterboxd style: the left half of a star gives x.5, the right half a full point.
 * Hover previews, clicking the current score clears it.
 */
export function Stars({ value, onChange, size = 22 }: { value: number; onChange: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const t = useT();
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label={t("Note")}>
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.span
          key={n}
          whileTap={{ scale: 0.85 }}
          animate={{ scale: n - 0.5 <= shown ? 1 : 0.88 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
          className="relative block p-0.5"
        >
          <StarShape fill={Math.max(0, Math.min(1, shown - (n - 1)))} size={size} />
          {[n - 0.5, n].map((v, half) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={value === v}
              aria-label={t("{n} sur 5", { n: fmtRating(v) })}
              onMouseEnter={() => setHover(v)}
              onFocus={() => setHover(v)}
              onBlur={() => setHover(0)}
              onClick={() => onChange(v)}
              className={`absolute inset-y-0 w-1/2 ${half ? "right-0" : "left-0"}`}
            />
          ))}
        </motion.span>
      ))}
    </div>
  );
}
