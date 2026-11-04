/** The four shelves. Films and series come from TMDB, albums from Deezer, books from Open Library. */
export type Kind = "movie" | "tv" | "album" | "book";
export const KINDS = ["movie", "tv", "album", "book"] as const;
export const isKind = (k: unknown): k is Kind => typeof k === "string" && (KINDS as readonly string[]).includes(k);
export const isScreen = (k: string) => k === "movie" || k === "tv";

export const kindLabel: Record<Kind, string> = { movie: "Film", tv: "Série", album: "Album", book: "Livre" };
/** "Seen" means listened to or read on the other shelves. */
export const seenLabels = (k: string): { done: string; mark: string } =>
  k === "album" ? { done: "Écouté", mark: "Déjà écouté" } : k === "book" ? { done: "Lu", mark: "Déjà lu" } : { done: "Vu", mark: "Déjà vu" };
/** Album covers are square. */
export const coverAspect = (k: string) => (k === "album" ? "aspect-square" : "aspect-[2/3]");
