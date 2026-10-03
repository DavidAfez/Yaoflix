import { img, type TitleRow } from "./tmdb";
import type { PosterData } from "@/components/poster";

export const toPoster = (t: TitleRow, ready = false): PosterData => ({
  kind: t.kind,
  tmdbId: t.tmdbId,
  name: t.name,
  year: t.year,
  poster: img(t.posterPath, "w342"),
  ready,
});

export const daysLeft = (d: Date) => Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400_000));
