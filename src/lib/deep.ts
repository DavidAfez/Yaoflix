/** Criteria of the detailed review. Keys are stored, labels can change freely. */
export const CRITERIA = [
  { key: "scenario", label: "Scénario" },
  { key: "mise_en_scene", label: "Mise en scène" },
  { key: "image", label: "Image et couleurs" },
  { key: "jeu", label: "Jeu d'acteurs" },
  { key: "son", label: "Musique et son" },
  { key: "effets", label: "Effets" },
  { key: "rythme", label: "Rythme" },
  { key: "emotion", label: "Émotion" },
] as const;

export const TAGS = [
  "Twist marquant",
  "Fin ratée",
  "Visuellement fou",
  "Trop long",
  "Dialogues ciselés",
  "Bande-son culte",
  "Personnages attachants",
  "Prévisible",
  "Original",
  "Effets datés",
  "Lent mais beau",
  "À revoir",
] as const;

/** Reviews needed before the detailed mode unlocks on its own. */
export const DEEP_UNLOCK = 10;
