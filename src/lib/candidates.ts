import "server-only";

/**
 * Picture-first suggestions for a title the catalogue doesn't have, so the member just picks
 * the right one instead of hunting a poster elsewhere. Free sources, no key needed:
 * Wikipedia (films, series), iTunes (albums), Open Library and Google Books (books).
 */
export type Candidate = { name: string; byline: string | null; year: number | null; image: string; note: string | null };

// Only these hosts may end up as a poster URL: the browser loads them, nothing else does
export const IMAGE_HOSTS = [/^https:\/\/upload\.wikimedia\.org\//, /^https:\/\/[\w-]+\.mzstatic\.com\//, /^https:\/\/books\.google\.com\//, /^https:\/\/books\.googleusercontent\.com\//, /^https:\/\/covers\.openlibrary\.org\//];
export const allowedImage = (u: string) => IMAGE_HOSTS.some((r) => r.test(u));

const UA = { "User-Agent": "GabaoFlix/1.0 (private film club)", accept: "application/json" };
const year = (s?: string | null) => Number(s?.match(/\b(18|19|20)\d{2}\b/)?.[0]) || null;

async function get<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

type WikiPages = { query?: { pages?: Record<string, { title: string; index?: number; description?: string; thumbnail?: { source: string } }> } };

async function wikipedia(lang: "fr" | "en", q: string, kind: "movie" | "tv") {
  const hint = kind === "tv" ? (lang === "fr" ? "série télévisée" : "TV series") : "film";
  const d = await get<WikiPages>(
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=8&prop=pageimages%7Cdescription&piprop=thumbnail&pithumbsize=500&gsrsearch=${encodeURIComponent(`${q} ${hint}`)}`,
  );
  return Object.values(d?.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((p) => p.thumbnail?.source)
    .map((p) => ({ name: p.title.replace(/\s*\((film|série télévisée|TV series)[^)]*\)$/i, ""), byline: null, year: year(p.description ?? p.title), image: p.thumbnail!.source, note: p.description ?? null }));
}

export async function candidates(kind: "movie" | "tv" | "album" | "book", q: string): Promise<Candidate[]> {
  const term = q.trim().slice(0, 100);
  if (term.length < 2) return [];
  let out: Candidate[] = [];
  if (kind === "movie" || kind === "tv") {
    out = await wikipedia("fr", term, kind);
    if (out.length < 3) out = [...out, ...(await wikipedia("en", term, kind))];
  } else if (kind === "album") {
    const d = await get<{ results: { collectionName: string; artistName: string; artworkUrl100?: string; releaseDate?: string }[] }>(
      `https://itunes.apple.com/search?entity=album&limit=12&country=FR&term=${encodeURIComponent(term)}`,
    );
    out = (d?.results ?? [])
      .filter((r) => r.artworkUrl100)
      .map((r) => ({ name: r.collectionName, byline: r.artistName, year: year(r.releaseDate), image: r.artworkUrl100!.replace(/\/\d+x\d+bb\./, "/600x600bb."), note: null }));
  } else {
    const ol = await get<{ docs: { title: string; author_name?: string[]; first_publish_year?: number; cover_i?: number }[] }>(
      `https://openlibrary.org/search.json?limit=12&fields=title,author_name,first_publish_year,cover_i&q=${encodeURIComponent(term)}`,
    );
    out = (ol?.docs ?? [])
      .filter((d) => d.cover_i)
      .map((d) => ({ name: d.title, byline: d.author_name?.slice(0, 2).join(", ") ?? null, year: d.first_publish_year ?? null, image: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`, note: null }));
    // Google Books only with a key: the keyless quota is shared worldwide and usually spent
    const key = process.env.GOOGLE_BOOKS_KEY;
    if (key && out.length < 6) {
      const g = await get<{ items?: { volumeInfo: { title: string; authors?: string[]; publishedDate?: string; imageLinks?: { thumbnail?: string } } }[] }>(
        `https://www.googleapis.com/books/v1/volumes?maxResults=10&key=${encodeURIComponent(key)}&q=${encodeURIComponent(term)}`,
      );
      out = [
        ...out,
        ...(g?.items ?? [])
          .filter((i) => i.volumeInfo.imageLinks?.thumbnail)
          .map((i) => ({ name: i.volumeInfo.title, byline: i.volumeInfo.authors?.slice(0, 2).join(", ") ?? null, year: year(i.volumeInfo.publishedDate), image: i.volumeInfo.imageLinks!.thumbnail!.replace(/^http:/, "https:").replace("&edge=curl", ""), note: null })),
      ];
    }
  }
  // Same picture twice (editions, languages): keep the first
  return [...new Map(out.filter((c) => allowedImage(c.image)).map((c) => [c.image, c])).values()].slice(0, 10);
}
