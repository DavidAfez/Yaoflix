"use client";
import { motion, type HTMLMotionProps } from "motion/react";
import { useFormStatus } from "react-dom";
import { forwardRef, useId } from "react";

type BtnProps = HTMLMotionProps<"button"> & { tone?: "lime" | "ghost" | "coral" | "bone"; size?: "md" | "lg" };

const tones = {
  lime: "bg-lime text-ink",
  bone: "bg-bone text-ink",
  coral: "bg-coral text-ink",
  ghost: "border border-line text-bone hover:border-bone/40",
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { tone = "lime", size = "md", className = "", children, ...rest },
  ref,
) {
  const solid = tone !== "ghost";
  return (
    <motion.button
      ref={ref}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={`${solid ? "notch" : ""} ${tones[tone]} ${size === "lg" ? "h-14 px-8 text-base" : "h-11 px-5 text-sm"} inline-flex items-center justify-center gap-2 font-semibold tracking-wide disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
});

export function Submit({ children, ...rest }: BtnProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...rest}>
      {pending ? <Dots /> : children}
    </Button>
  );
}

export function Dots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block size-1.5 bg-current"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

/** Underlined field, label floats up on focus. */
export function Field({
  label,
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={`group relative block pt-5 ${className}`}>
      <input
        id={id}
        placeholder=" "
        className="peer w-full border-b border-line bg-transparent pb-2 pt-1 text-lg outline-none transition-colors focus:border-lime"
        {...rest}
      />
      <span className="pointer-events-none absolute left-0 top-6 text-lg text-dim transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] peer-focus:top-0 peer-focus:text-xs peer-focus:text-lime peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:text-xs">
        {label}
      </span>
    </label>
  );
}

/** Segmented choice with a sliding marker. Replaces pills and dropdowns for short option sets. */
export function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
  label,
}: {
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  const group = useId();
  return (
    <fieldset className="min-w-0">
      {label && <legend className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-bone">{label}</legend>}
      <div className="flex border-b border-line">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label key={o.value} className="relative flex-1 cursor-pointer py-3 text-center text-sm">
              <input type="radio" name={name} value={o.value} checked={on} onChange={() => onChange(o.value)} className="sr-only" />
              <span className={on ? "text-bone" : "text-dim transition-colors hover:text-bone"}>{o.label}</span>
              {on && <motion.span layoutId={group} className="absolute inset-x-0 -bottom-px h-0.5 bg-lime" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -4, 4, 0] }} className="text-sm text-coral">
      {message}
    </motion.p>
  );
}
