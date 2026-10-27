"use client";
import { motion } from "motion/react";
import { Mail } from "lucide-react";
import { useT } from "@/components/i18n";

export function Sent() {
  const t = useT();
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
        className="notch grid size-20 place-items-center bg-lime text-ink"
      >
        <Mail size={34} />
      </motion.div>
      <p className="font-display text-3xl font-semibold leading-tight">{t("Regarde tes mails.")}</p>
    </motion.div>
  );
}
