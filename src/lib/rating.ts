/** 3.5 → "3,5" */
export const fmtRating = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
