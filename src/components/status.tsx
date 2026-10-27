"use client";
import { rejectLabels } from "@/lib/labels";
import { useT } from "./i18n";
import type { RejectReason } from "@/db/schema";

const map = {
  PENDING: { label: "En attente", cls: "bg-dim" },
  IN_PROGRESS: { label: "En cours", cls: "bg-ice animate-pulse" },
  FULFILLED: { label: "Prêt", cls: "bg-lime" },
  REJECTED: { label: "Refusé", cls: "bg-coral" },
} as const;

export function StatusMark({ status, reason }: { status: keyof typeof map; reason?: RejectReason | null }) {
  const s = map[status];
  const t = useT();
  return (
    <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
      <span className={`size-2 ${s.cls}`} />
      {t(status === "REJECTED" && reason ? rejectLabels[reason] : s.label)}
    </span>
  );
}
