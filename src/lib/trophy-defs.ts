/**
 * The trophies, from a first time to the one nobody will ever get. Pure data, shared by the
 * server (which decides what is won) and the pages (which show progress).
 */

export type Tier = "easy" | "medium" | "hard" | "brutal" | "impossible";
export const TIERS: Tier[] = ["easy", "medium", "hard", "brutal", "impossible"];
export const tierLabel: Record<Tier, string> = { easy: "Facile", medium: "Moyen", hard: "Dur", brutal: "Très dur", impossible: "Impossible" };

/** What the server counts for one member. */
export type TrophyStats = {
  seen: { movie: number; tv: number; album: number; book: number };
  genres: string[];
  decades: number;
  ratings: number;
  voice: number;
  posts: number;
  likesReceived: number;
  requests: number;
  watchlist: number;
  watchlistSeen: number;
  nightWatches: number;
  activeDays: number;
  catalogue: number;
  seenAll: number;
};

export type TrophyDef = {
  id: string;
  tier: Tier;
  name: string;
  hint: string;
  icon: string;
  /** [where the member is, what it takes] */
  progress: (s: TrophyStats) => [number, number];
};

const has = (s: TrophyStats, ...names: string[]): [number, number] => [s.genres.some((g) => names.includes(g)) ? 1 : 0, 1];
const shelves = (s: TrophyStats) => Object.values(s.seen).filter((n) => n > 0).length;
const screens = (s: TrophyStats) => s.seen.movie + s.seen.tv;

export const TROPHIES: TrophyDef[] = [
  // Easy: a first time in each corner of the site
  { id: "first-movie", tier: "easy", name: "Première séance", hint: "Marquer un film comme vu", icon: "film", progress: (s) => [s.seen.movie, 1] },
  { id: "first-tv", tier: "easy", name: "Premier épisode", hint: "Marquer une série comme vue", icon: "tv", progress: (s) => [s.seen.tv, 1] },
  { id: "first-album", tier: "easy", name: "Première écoute", hint: "Marquer un album comme écouté", icon: "disc", progress: (s) => [s.seen.album, 1] },
  { id: "first-book", tier: "easy", name: "Première page", hint: "Marquer un livre comme lu", icon: "book", progress: (s) => [s.seen.book, 1] },
  { id: "first-post", tier: "easy", name: "Premier mot", hint: "Publier un post", icon: "message", progress: (s) => [s.posts, 1] },
  { id: "first-rating", tier: "easy", name: "Premier avis", hint: "Noter un titre", icon: "star", progress: (s) => [s.ratings, 1] },
  { id: "first-voice", tier: "easy", name: "Première voix", hint: "Laisser un avis vocal", icon: "mic", progress: (s) => [s.voice, 1] },
  { id: "first-request", tier: "easy", name: "Première demande", hint: "Demander un titre", icon: "send", progress: (s) => [s.requests, 1] },
  { id: "genre-horror", tier: "easy", name: "Frissons", hint: "Voir un film d'horreur", icon: "ghost", progress: (s) => has(s, "Horreur") },
  { id: "genre-comedy", tier: "easy", name: "Fou rire", hint: "Voir une comédie", icon: "laugh", progress: (s) => has(s, "Comédie") },
  { id: "genre-animation", tier: "easy", name: "Image par image", hint: "Voir un film d'animation", icon: "palette", progress: (s) => has(s, "Animation") },
  { id: "genre-doc", tier: "easy", name: "Le réel", hint: "Voir un documentaire", icon: "eye", progress: (s) => has(s, "Documentaire") },
  { id: "genre-romance", tier: "easy", name: "Cœur d'artichaut", hint: "Voir une romance", icon: "heart", progress: (s) => has(s, "Romance") },
  { id: "genre-scifi", tier: "easy", name: "Ailleurs", hint: "Voir de la science-fiction", icon: "rocket", progress: (s) => has(s, "Science-fiction", "Science-Fiction & Fantastique") },

  // Medium
  { id: "all-shelves", tier: "medium", name: "Touche-à-tout", hint: "Un film, une série, un album et un livre", icon: "shapes", progress: (s) => [shelves(s), 4] },
  { id: "screens-25", tier: "medium", name: "Habitué", hint: "25 films ou séries vus", icon: "clapper", progress: (s) => [screens(s), 25] },
  { id: "genres-8", tier: "medium", name: "Éclectique", hint: "8 genres différents", icon: "shuffle", progress: (s) => [s.genres.length, 8] },
  { id: "watchlist-done", tier: "medium", name: "Liste bouclée", hint: "Tout voir dans sa liste (5 titres au moins)", icon: "check", progress: (s) => [s.watchlistSeen, Math.max(5, s.watchlist)] },
  { id: "posts-20", tier: "medium", name: "Bavard", hint: "20 posts", icon: "messages", progress: (s) => [s.posts, 20] },
  { id: "night-owl", tier: "medium", name: "Oiseau de nuit", hint: "Lancer un film entre minuit et 5 h", icon: "moon", progress: (s) => [s.nightWatches, 1] },
  { id: "tv-10", tier: "medium", name: "Accro aux séries", hint: "10 séries vues", icon: "tv", progress: (s) => [s.seen.tv, 10] },
  { id: "albums-10", tier: "medium", name: "Mélomane", hint: "10 albums écoutés", icon: "headphones", progress: (s) => [s.seen.album, 10] },
  { id: "books-10", tier: "medium", name: "Rat de bibliothèque", hint: "10 livres lus", icon: "library", progress: (s) => [s.seen.book, 10] },
  { id: "ratings-20", tier: "medium", name: "Exigeant", hint: "20 titres notés", icon: "star", progress: (s) => [s.ratings, 20] },
  { id: "voice-5", tier: "medium", name: "De vive voix", hint: "5 avis vocaux", icon: "mic", progress: (s) => [s.voice, 5] },
  { id: "requests-5", tier: "medium", name: "Chercheur", hint: "5 titres demandés", icon: "send", progress: (s) => [s.requests, 5] },
  { id: "likes-10", tier: "medium", name: "Remarqué", hint: "10 cœurs reçus sur ses posts", icon: "heart", progress: (s) => [s.likesReceived, 10] },
  { id: "days-7", tier: "medium", name: "Habitué des lieux", hint: "Venir 7 jours différents", icon: "calendar", progress: (s) => [s.activeDays, 7] },

  // Hard
  { id: "screens-100", tier: "hard", name: "Centurion", hint: "100 films ou séries vus", icon: "medal", progress: (s) => [screens(s), 100] },
  { id: "decades-6", tier: "hard", name: "Voyageur du temps", hint: "Des films de 6 décennies différentes", icon: "hourglass", progress: (s) => [s.decades, 6] },
  { id: "ratings-50", tier: "hard", name: "Critique", hint: "50 titres notés", icon: "stars", progress: (s) => [s.ratings, 50] },
  { id: "likes-100", tier: "hard", name: "Populaire", hint: "100 cœurs reçus sur ses posts", icon: "flame", progress: (s) => [s.likesReceived, 100] },

  { id: "tv-50", tier: "hard", name: "Marathonien", hint: "50 séries vues", icon: "tv", progress: (s) => [s.seen.tv, 50] },
  { id: "albums-50", tier: "hard", name: "Discothèque", hint: "50 albums écoutés", icon: "disc", progress: (s) => [s.seen.album, 50] },
  { id: "books-50", tier: "hard", name: "Bibliothèque vivante", hint: "50 livres lus", icon: "library", progress: (s) => [s.seen.book, 50] },
  { id: "voice-25", tier: "hard", name: "Conteur", hint: "25 avis vocaux", icon: "mic", progress: (s) => [s.voice, 25] },
  { id: "posts-100", tier: "hard", name: "Plume", hint: "100 posts", icon: "pen", progress: (s) => [s.posts, 100] },
  { id: "night-10", tier: "hard", name: "Insomniaque", hint: "10 films lancés entre minuit et 5 h", icon: "moon", progress: (s) => [s.nightWatches, 10] },
  { id: "watchlist-20", tier: "hard", name: "Liste interminable", hint: "Tout voir dans sa liste (20 titres au moins)", icon: "list", progress: (s) => [s.watchlistSeen, Math.max(20, s.watchlist)] },
  { id: "days-50", tier: "hard", name: "Pilier", hint: "Venir 50 jours différents", icon: "calendar", progress: (s) => [s.activeDays, 50] },

  // Brutal
  { id: "screens-500", tier: "brutal", name: "Le gaaazz du ciné", hint: "500 films ou séries vus", icon: "crown", progress: (s) => [screens(s), 500] },
  { id: "decades-10", tier: "brutal", name: "Un siècle de cinéma", hint: "Des films de 10 décennies différentes", icon: "landmark", progress: (s) => [s.decades, 10] },
  { id: "genres-15", tier: "brutal", name: "Sans frontières", hint: "15 genres différents", icon: "globe", progress: (s) => [s.genres.length, 15] },

  // The one nobody gets: the catalogue grows with every search, the finish line runs away
  { id: "seen-everything", tier: "impossible", name: "Tout vu", hint: "Avoir vu, lu et écouté tout le catalogue", icon: "infinity", progress: (s) => [s.seenAll, Math.max(1, s.catalogue)] },
];

export const trophyById = new Map(TROPHIES.map((t) => [t.id, t]));

export const won = (t: TrophyDef, s: TrophyStats) => {
  // Never awarded, whatever the count says: that's the point of this one
  if (t.tier === "impossible") return false;
  const [have, need] = t.progress(s);
  return have >= need;
};

/** The closest trophy not won yet, if it's within reach (two thirds of the way or more). */
export function nearest(s: TrophyStats, unlocked: Set<string>) {
  let best: { def: TrophyDef; have: number; need: number; ratio: number } | null = null;
  for (const def of TROPHIES) {
    if (def.tier === "impossible" || unlocked.has(def.id)) continue;
    const [have, need] = def.progress(s);
    const ratio = Math.min(1, have / need);
    if (need > 1 && ratio >= 2 / 3 && ratio < 1 && (!best || ratio > best.ratio)) best = { def, have, need, ratio };
  }
  return best;
}
