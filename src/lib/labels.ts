import type { RejectReason, RequestPrefs } from "@/db/schema";

export const rejectLabels: Record<RejectReason, string> = {
  NOT_RELEASED: "Pas encore sorti",
  NO_SOURCE: "Aucune source",
  LOW_QUALITY: "Qualité trop faible",
  NO_LANGUAGE: "Langue introuvable",
  DUPLICATE: "Déjà en ligne",
  OTHER: "Autre",
};

export const qualityOptions: { value: RequestPrefs["quality"]; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "480", label: "480p" },
  { value: "720", label: "720p" },
  { value: "1080", label: "1080p" },
  { value: "2160", label: "4K" },
];

export const audioOptions: { value: RequestPrefs["audio"]; label: string }[] = [
  { value: "any", label: "Peu importe" },
  { value: "vf", label: "VF" },
  { value: "vo", label: "VO" },
];

export const subsOptions: { value: RequestPrefs["subs"]; label: string }[] = [
  { value: "none", label: "Aucun" },
  { value: "fr", label: "FR" },
  { value: "en", label: "EN" },
];

export const ageBrackets = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"] as const;
export const sexes = [
  { value: "F", label: "Femme" },
  { value: "M", label: "Homme" },
  { value: "X", label: "Autre" },
] as const;

export const recencyBucket = (years: number | null | undefined) => {
  if (years == null) return "Inconnu";
  if (years < 1) return "Moins d'un an";
  if (years < 5) return "1 à 5 ans";
  if (years < 15) return "5 à 15 ans";
  return "Classiques";
};
export const recencyOrder = ["Moins d'un an", "1 à 5 ans", "5 à 15 ans", "Classiques", "Inconnu"];
