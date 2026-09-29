// Reading the archive: visible items, photos, search, filters, tag index, timeline.
import { monthOf } from './dates';
import { tagKey } from './tags';
import type { Archive, Item, Kind, Photo, Status } from './types';

export const liveItems = (a: Archive): Item[] => a.items.filter((it) => !it.deletedAt);

/** Photos of an item, oldest first (the painting progress reads left to right). */
export function photosOf(a: Archive, itemId: string): Photo[] {
  return a.photos.filter((p) => p.itemId === itemId && !p.deletedAt).sort(byTaken);
}

export const byTaken = (x: Photo, y: Photo) => x.takenAt.localeCompare(y.takenAt) || x.addedAt.localeCompare(y.addedAt);

/** Photos whose item is alive, newest first. */
export function livePhotos(a: Archive): Photo[] {
  const alive = new Set(liveItems(a).map((it) => it.id));
  return a.photos.filter((p) => !p.deletedAt && alive.has(p.itemId)).sort((x, y) => byTaken(y, x));
}

/** The explicit cover, else the newest photo, else null. */
export function coverOf(a: Archive, item: Item): Photo | null {
  if (item.coverId) {
    const p = a.photos.find((x) => x.id === item.coverId && !x.deletedAt);
    if (p) return p;
  }
  const photos = photosOf(a, item.id);
  return photos.length ? photos[photos.length - 1] : null;
}

export type SortMode = 'recent' | 'finished' | 'name' | 'created';

export interface Filter {
  q: string;
  tags: string[];
  statuses: Status[];
  kinds: Kind[];
  favorites: boolean;
  sort: SortMode;
}

export const EMPTY_FILTER: Filter = { q: '', tags: [], statuses: [], kinds: [], favorites: false, sort: 'recent' };

export const isFiltering = (f: Filter) => !!(f.q.trim() || f.tags.length || f.statuses.length || f.kinds.length || f.favorites);

const fold = (s: string) =>
  s
    .toLocaleLowerCase('de-DE')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');

/** Every word of the query has to appear in name, tags, notes, kind or a photo caption. */
function matchesQuery(item: Item, words: string[], captions: Map<string, string>): boolean {
  if (!words.length) return true;
  const hay = fold([item.name, item.notes, ...item.tags, captions.get(item.id) ?? ''].join(' \u0001 '));
  return words.every((w) => hay.includes(w));
}

/** Last activity of an item: newest photo or last edit. */
export function lastActivity(a: Archive, item: Item): string {
  let latest = item.updatedAt;
  for (const p of a.photos) if (p.itemId === item.id && !p.deletedAt && p.addedAt > latest) latest = p.addedAt;
  return latest;
}

export function filterItems(a: Archive, f: Filter): Item[] {
  const words = fold(f.q).split(/\s+/).filter(Boolean);
  const captions = new Map<string, string>();
  if (words.length)
    for (const p of a.photos) if (!p.deletedAt && p.caption) captions.set(p.itemId, `${captions.get(p.itemId) ?? ''} ${p.caption}`);
  const tagKeys = f.tags.map(tagKey);
  const list = liveItems(a).filter(
    (it) =>
      (!f.favorites || it.favorite) &&
      (!f.statuses.length || f.statuses.includes(it.status)) &&
      (!f.kinds.length || f.kinds.includes(it.kind)) &&
      tagKeys.every((k) => it.tags.some((t) => tagKey(t) === k)) &&
      matchesQuery(it, words, captions),
  );
  return sortItems(a, list, f.sort);
}

export function sortItems(a: Archive, list: Item[], sort: SortMode): Item[] {
  const out = [...list];
  switch (sort) {
    case 'name':
      return out.sort((x, y) => (x.name || '￿').localeCompare(y.name || '￿', 'de'));
    case 'created':
      return out.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    case 'finished':
      // Finished works by finish date, then the rest by activity.
      return out.sort((x, y) => {
        if (x.finishedAt && y.finishedAt) return y.finishedAt.localeCompare(x.finishedAt);
        if (x.finishedAt) return -1;
        if (y.finishedAt) return 1;
        return lastActivity(a, y).localeCompare(lastActivity(a, x));
      });
    default: {
      const act = new Map(out.map((it) => [it.id, lastActivity(a, it)]));
      return out.sort((x, y) => act.get(y.id)!.localeCompare(act.get(x.id)!));
    }
  }
}

export interface TagCount {
  tag: string;
  count: number;
}

/** All tags of live items with their number of items, most used first. */
export function tagIndex(a: Archive): TagCount[] {
  const counts = new Map<string, TagCount>();
  for (const it of liveItems(a))
    for (const t of it.tags) {
      const key = tagKey(t);
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { tag: t, count: 1 });
    }
  return [...counts.values()].sort((x, y) => y.count - x.count || x.tag.localeCompare(y.tag, 'de'));
}

export interface MonthGroup<T> {
  month: string;
  entries: T[];
}

/** Groups photos (already sorted newest first) by the month they were taken. */
export function groupByMonth(photos: Photo[]): MonthGroup<Photo>[] {
  const groups: MonthGroup<Photo>[] = [];
  for (const p of photos) {
    const month = monthOf(p.takenAt);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.entries.push(p);
    else groups.push({ month, entries: [p] });
  }
  return groups;
}

/** Photos of the given items, newest first – for the photo timeline with filters applied. */
export function photosOfItems(a: Archive, items: Item[]): Photo[] {
  const ids = new Set(items.map((it) => it.id));
  return a.photos.filter((p) => !p.deletedAt && ids.has(p.itemId)).sort((x, y) => byTaken(y, x));
}

export interface TrashEntry {
  kind: 'item' | 'photo';
  id: string;
  deletedAt: string;
  item: Item;
  photo: Photo | null;
}

export function trashEntries(a: Archive): TrashEntry[] {
  const out: TrashEntry[] = [];
  const byId = new Map(a.items.map((it) => [it.id, it]));
  for (const it of a.items) if (it.deletedAt) out.push({ kind: 'item', id: it.id, deletedAt: it.deletedAt, item: it, photo: null });
  for (const p of a.photos) {
    const item = byId.get(p.itemId);
    // Photos of a trashed item go with the item.
    if (p.deletedAt && item && !item.deletedAt) out.push({ kind: 'photo', id: p.id, deletedAt: p.deletedAt, item, photo: p });
  }
  return out.sort((x, y) => y.deletedAt.localeCompare(x.deletedAt));
}

/** Display name for items without one. */
export function itemTitle(item: Item): string {
  return item.name || 'Unbenanntes Werk';
}
