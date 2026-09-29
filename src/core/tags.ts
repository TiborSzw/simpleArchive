// Tags are free text. They keep the spelling of their first use and are
// compared case-insensitively, so "orks", "Orks" and "#Orks" are one tag.

export const MAX_TAG_LENGTH = 40;

export const tagKey = (tag: string) => tag.toLocaleLowerCase('de-DE');

export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .replace(/[\s_]+/g, ' ')
    .replace(/,/g, '')
    .trim()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

/** Adds tags without duplicates (case-insensitive), preferring the spelling in `known`. */
export function mergeTags(current: string[], add: string[], known: string[] = []): string[] {
  const out = [...current];
  const keys = new Set(current.map(tagKey));
  const canonical = new Map(known.map((t) => [tagKey(t), t]));
  for (const raw of add) {
    const tag = normalizeTag(raw);
    if (!tag) continue;
    const key = tagKey(tag);
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(canonical.get(key) ?? tag);
  }
  return out;
}

export const hasTag = (tags: string[], tag: string) => tags.some((t) => tagKey(t) === tagKey(tag));

export const removeTag = (tags: string[], tag: string) => tags.filter((t) => tagKey(t) !== tagKey(tag));

/**
 * Pulls "#hashtags" out of a text: "Captain Titus #Space Marines" does not work
 * with spaces, so multi-word tags use underscores or dashes: "#Space_Marines".
 */
export function parseHashtags(text: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const rest = text.replace(/(^|\s)#([^\s#]+)/gu, (_m, lead: string, tag: string) => {
    const t = normalizeTag(tag.replace(/[-_]/g, (c) => (c === '_' ? ' ' : c)));
    if (t) tags.push(t);
    return lead;
  });
  return { text: rest.replace(/\s{2,}/g, ' ').trim(), tags };
}
