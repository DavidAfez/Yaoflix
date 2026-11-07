/**
 * Hashtags: "#" then 2 to 40 letters (accents included), digits or "_", not glued to a word
 * before it (so "C#" or "page#2" are not tags). Compared in lower case.
 */
const TAG = /(^|[^\p{L}\p{N}_#])#([\p{L}\p{N}_]{2,40})/gu;
export const TAG_CHARS = /^[\p{L}\p{N}_]{2,40}$/u;

export const normTag = (t: string) => t.normalize("NFC").toLowerCase();

export function tagsOf(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...new Set([...text.matchAll(TAG)].map((m) => normTag(m[2])))];
}

/** The text cut into plain parts and tags, for rendering the tags as links. */
export function splitTags(text: string): ({ text: string } | { tag: string; raw: string })[] {
  const out: ({ text: string } | { tag: string; raw: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    const start = m.index + m[1].length;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ tag: normTag(m[2]), raw: `#${m[2]}` });
    last = start + m[2].length + 1;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The tag being typed right before the caret, if any ("#cin|" → "cin"). */
export function tagAtCaret(text: string, caret: number): string | null {
  const m = text.slice(0, caret).match(/(^|[^\p{L}\p{N}_#])#([\p{L}\p{N}_]{0,40})$/u);
  return m ? m[2] : null;
}
