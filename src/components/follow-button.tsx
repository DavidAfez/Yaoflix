"use client";
import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { setFollow } from "@/app/feed/actions";
import { useT } from "./i18n";

export function FollowButton({ handle, following }: { handle: string; following: boolean }) {
  const t = useT();
  const [on, setOn] = useState(following);
  const [, start] = useTransition();
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={() => {
        setOn(!on);
        start(() => setFollow(handle, !on));
      }}
      className={`flex h-11 items-center px-6 text-sm font-semibold transition-colors ${on ? "border border-line text-bone hover:border-coral hover:text-coral" : "notch bg-lime text-ink"}`}
    >
      {t(on ? "Abonné" : "Suivre")}
    </motion.button>
  );
}
