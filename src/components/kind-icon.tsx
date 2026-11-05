import { BookOpen, Disc3, Film, Tv } from "lucide-react";
import type { Kind } from "@/lib/kinds";

const ICONS = { movie: Film, tv: Tv, album: Disc3, book: BookOpen } as const;

/** One icon per shelf, the same in filters, cards and pickers. */
export function KindIcon({ kind, size = 14, className = "" }: { kind: string; size?: number; className?: string }) {
  const I = ICONS[kind as Kind];
  return I ? <I size={size} className={className} aria-hidden /> : null;
}
