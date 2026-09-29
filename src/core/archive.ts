// All changes to the archive as pure functions: (archive, …) → new archive.
// No storage, no UI – that keeps them easy to test and to undo.
import { TRASH_DAYS } from './constants';
import { daysBetween } from './dates';
import { newId } from './ids';
import { mergeTags, normalizeTag, tagKey } from './tags';
import { DEFAULT_SETTINGS, type Archive, type ArchiveSettings, type Item, type ItemDraft, type NewPhoto, type Photo, type Status } from './types';

export function emptyArchive(now: string): Archive {
  return { app: 'simpleArchive', version: 1, id: newId(16), items: [], photos: [], settings: { ...DEFAULT_SETTINGS }, createdAt: now, updatedAt: now };
}

const touch = (a: Archive, now: string): Archive => ({ ...a, updatedAt: now });

function uniqueId(taken: { id: string }[]): string {
  const ids = new Set(taken.map((x) => x.id));
  let id = newId();
  while (ids.has(id)) id = newId();
  return id;
}

export const allTags = (a: Archive): string[] => {
  const seen = new Map<string, string>();
  for (const it of a.items) for (const t of it.tags) if (!seen.has(tagKey(t))) seen.set(tagKey(t), t);
  return [...seen.values()];
};

/** Status side effects: first "in Arbeit" sets startedAt, "fertig" sets finishedAt. */
function applyStatus(item: Item, status: Status, now: string): Item {
  if (status === item.status) return item;
  const next = { ...item, status };
  if ((status === 'wip' || status === 'done') && !next.startedAt) next.startedAt = now;
  if (status === 'done' && !next.finishedAt) next.finishedAt = now;
  if (status !== 'done') next.finishedAt = null;
  return next;
}

export function createItem(a: Archive, draft: Partial<ItemDraft>, now: string): { archive: Archive; item: Item } {
  const base: Item = {
    id: uniqueId(a.items),
    name: (draft.name ?? '').trim(),
    kind: draft.kind ?? 'mini',
    status: 'unpainted',
    tags: mergeTags([], draft.tags ?? [], allTags(a)),
    favorite: draft.favorite ?? false,
    notes: draft.notes ?? '',
    models: Math.max(1, Math.round(draft.models ?? 1)),
    coverId: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    deletedAt: null,
  };
  const item = applyStatus(base, draft.status ?? 'unpainted', now);
  return { archive: touch({ ...a, items: [item, ...a.items] }, now), item };
}

export type ItemPatch = Partial<Omit<Item, 'id' | 'createdAt' | 'updatedAt'>>;

export function updateItem(a: Archive, id: string, patch: ItemPatch, now: string): Archive {
  let found = false;
  const items = a.items.map((it) => {
    if (it.id !== id) return it;
    found = true;
    let next: Item = { ...it, ...patch, status: it.status, updatedAt: now };
    if (patch.name !== undefined) next.name = patch.name.trim();
    if (patch.tags) next.tags = mergeTags([], patch.tags, allTags(a));
    if (patch.models !== undefined) next.models = Math.max(1, Math.round(patch.models) || 1);
    if (patch.status) next = applyStatus(next, patch.status, now);
    // An explicitly edited finish date wins over the automatic one.
    if (patch.finishedAt !== undefined && next.status === 'done') next.finishedAt = patch.finishedAt ?? now;
    return next;
  });
  return found ? touch({ ...a, items }, now) : a;
}

export function toggleFavorite(a: Archive, id: string, now: string): Archive {
  const item = a.items.find((it) => it.id === id);
  return item ? updateItem(a, id, { favorite: !item.favorite }, now) : a;
}

export function addPhotos(a: Archive, itemId: string, photos: NewPhoto[], now: string): { archive: Archive; added: Photo[] } {
  const item = a.items.find((it) => it.id === itemId);
  if (!item) return { archive: a, added: [] };
  const added: Photo[] = [];
  const taken = [...a.photos];
  for (const p of photos) {
    const photo: Photo = {
      id: uniqueId(taken),
      itemId,
      file: p.file,
      thumb: p.thumb,
      width: p.width,
      height: p.height,
      bytes: p.bytes,
      takenAt: p.takenAt,
      addedAt: now,
      caption: p.caption ?? '',
      stage: item.status,
      inAlbum: p.inAlbum ?? false,
      deletedAt: null,
    };
    taken.push(photo);
    added.push(photo);
  }
  const items = a.items.map((it) => (it.id === itemId ? { ...it, updatedAt: now } : it));
  return { archive: touch({ ...a, items, photos: [...a.photos, ...added] }, now), added };
}

export type PhotoPatch = Partial<Pick<Photo, 'caption' | 'stage' | 'takenAt' | 'inAlbum'>>;

export function updatePhoto(a: Archive, id: string, patch: PhotoPatch, now: string): Archive {
  if (!a.photos.some((p) => p.id === id)) return a;
  return touch({ ...a, photos: a.photos.map((p) => (p.id === id ? { ...p, ...patch } : p)) }, now);
}

/** Marks photos as copied into the phone album (no `updatedAt` bump – nothing to back up). */
export function markInAlbum(a: Archive, ids: string[]): Archive {
  const set = new Set(ids);
  return { ...a, photos: a.photos.map((p) => (set.has(p.id) ? { ...p, inAlbum: true } : p)) };
}

export function movePhoto(a: Archive, photoId: string, itemId: string, now: string): Archive {
  const photo = a.photos.find((p) => p.id === photoId);
  if (!photo || photo.itemId === itemId || !a.items.some((it) => it.id === itemId)) return a;
  const items = a.items.map((it) => {
    if (it.id === photo.itemId && it.coverId === photoId) return { ...it, coverId: null, updatedAt: now };
    if (it.id === itemId || it.id === photo.itemId) return { ...it, updatedAt: now };
    return it;
  });
  return touch({ ...a, items, photos: a.photos.map((p) => (p.id === photoId ? { ...p, itemId } : p)) }, now);
}

export function setCover(a: Archive, itemId: string, photoId: string | null, now: string): Archive {
  return updateItem(a, itemId, { coverId: photoId }, now);
}

// ---------------------------------------------------------------------------
// Trash: deleting only hides things for TRASH_DAYS days, then they are purged.
// ---------------------------------------------------------------------------

export function trashItem(a: Archive, id: string, now: string): Archive {
  if (!a.items.some((it) => it.id === id && !it.deletedAt)) return a;
  return touch({ ...a, items: a.items.map((it) => (it.id === id ? { ...it, deletedAt: now, updatedAt: now } : it)) }, now);
}

export function trashPhoto(a: Archive, id: string, now: string): Archive {
  const photo = a.photos.find((p) => p.id === id && !p.deletedAt);
  if (!photo) return a;
  const items = a.items.map((it) => (it.id === photo.itemId ? { ...it, coverId: it.coverId === id ? null : it.coverId, updatedAt: now } : it));
  return touch({ ...a, items, photos: a.photos.map((p) => (p.id === id ? { ...p, deletedAt: now } : p)) }, now);
}

export function restoreItem(a: Archive, id: string, now: string): Archive {
  return touch({ ...a, items: a.items.map((it) => (it.id === id ? { ...it, deletedAt: null, updatedAt: now } : it)) }, now);
}

export function restorePhoto(a: Archive, id: string, now: string): Archive {
  const photo = a.photos.find((p) => p.id === id);
  if (!photo) return a;
  // Restoring a photo of a trashed item brings the item back too.
  const items = a.items.map((it) => (it.id === photo.itemId && it.deletedAt ? { ...it, deletedAt: null, updatedAt: now } : it));
  return touch({ ...a, items, photos: a.photos.map((p) => (p.id === id ? { ...p, deletedAt: null } : p)) }, now);
}

export interface PurgeResult {
  archive: Archive;
  /** Media files that are no longer referenced and can be deleted. */
  files: string[];
}

/**
 * Removes trash entries for good. With `all`, everything in the trash goes;
 * otherwise only entries older than TRASH_DAYS.
 */
export function purgeTrash(a: Archive, now: string, all = false): PurgeResult {
  const expired = (deletedAt: string | null) => !!deletedAt && (all || daysBetween(deletedAt, now) >= TRASH_DAYS);
  const deadItems = new Set(a.items.filter((it) => expired(it.deletedAt)).map((it) => it.id));
  const keepPhoto = (p: Photo) => !deadItems.has(p.itemId) && !expired(p.deletedAt);
  const removed = a.photos.filter((p) => !keepPhoto(p));
  if (!removed.length && !deadItems.size) return { archive: a, files: [] };
  const files = removed.flatMap((p) => [p.file, p.thumb]);
  return {
    archive: touch({ ...a, items: a.items.filter((it) => !deadItems.has(it.id)), photos: a.photos.filter(keepPhoto) }, now),
    files,
  };
}

/** Deletes one trashed entry right away. */
export function purgeOne(a: Archive, kind: 'item' | 'photo', id: string, now: string): PurgeResult {
  if (kind === 'photo') {
    const p = a.photos.find((x) => x.id === id);
    if (!p) return { archive: a, files: [] };
    return { archive: touch({ ...a, photos: a.photos.filter((x) => x.id !== id) }, now), files: [p.file, p.thumb] };
  }
  const photos = a.photos.filter((p) => p.itemId === id);
  return {
    archive: touch({ ...a, items: a.items.filter((it) => it.id !== id), photos: a.photos.filter((p) => p.itemId !== id) }, now),
    files: photos.flatMap((p) => [p.file, p.thumb]),
  };
}

// ---------------------------------------------------------------------------
// Tags & settings
// ---------------------------------------------------------------------------

/** Renames (or merges) a tag everywhere. */
export function renameTag(a: Archive, from: string, to: string, now: string): Archive {
  const target = normalizeTag(to);
  const key = tagKey(from);
  if (!target) return deleteTag(a, from, now);
  let changed = false;
  const items = a.items.map((it) => {
    if (!it.tags.some((t) => tagKey(t) === key)) return it;
    changed = true;
    const replaced = it.tags.map((t) => (tagKey(t) === key ? target : t));
    return { ...it, tags: mergeTags([], replaced), updatedAt: now };
  });
  return changed ? touch({ ...a, items }, now) : a;
}

export function deleteTag(a: Archive, tag: string, now: string): Archive {
  const key = tagKey(tag);
  let changed = false;
  const items = a.items.map((it) => {
    if (!it.tags.some((t) => tagKey(t) === key)) return it;
    changed = true;
    return { ...it, tags: it.tags.filter((t) => tagKey(t) !== key), updatedAt: now };
  });
  return changed ? touch({ ...a, items }, now) : a;
}

export function updateSettings(a: Archive, patch: Partial<ArchiveSettings>, now: string): Archive {
  return touch({ ...a, settings: { ...a.settings, ...patch } }, now);
}

/** Media files referenced by the archive (including the trash). */
export function referencedFiles(a: Archive): Set<string> {
  const out = new Set<string>();
  for (const p of a.photos) {
    out.add(p.file);
    out.add(p.thumb);
  }
  return out;
}
