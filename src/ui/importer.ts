// Getting photos into the archive: pick/take → process → store → attach.
import { addPhotos, createItem, markInAlbum } from '../core/archive';
import { newId } from '../core/ids';
import { itemTitle, photosOf } from '../core/query';
import type { ItemDraft, NewPhoto, Photo } from '../core/types';
import { editPhoto, pickPhotos, takePhoto, type PickedImage } from '../native/camera';
import { albumFileName, albumSupported, saveToAlbum } from '../native/gallery';
import { removeMedia, writeMedia } from '../native/media';
import { haptic } from '../native/platform';
import { processImage } from './image';
import { closeSheet, openSheet, push } from './nav';
import { addPending, archive, busy, clearPending, flushSave, mutate, toast } from './store';

let cancelled = false;

/** Processes picked images one by one (keeps memory low) and stores them. */
async function store(picked: PickedImage[]): Promise<NewPhoto[]> {
  const maxEdge = archive.get().settings.maxEdge;
  const out: NewPhoto[] = [];
  cancelled = false;
  busy.set({ title: picked.length > 1 ? 'Fotos werden vorbereitet' : 'Foto wird vorbereitet', done: 0, total: picked.length, cancel: () => (cancelled = true) });
  try {
    for (let i = 0; i < picked.length; i++) {
      if (cancelled) break;
      try {
        const img = await processImage(picked[i].blob, maxEdge, picked[i].createdAt);
        const stamp = img.takenAt.slice(0, 10);
        const id = newId(8);
        const file = `p_${stamp}_${id}.jpg`;
        const thumb = `t_${stamp}_${id}.jpg`;
        addPending([file, thumb]);
        await writeMedia(file, img.full);
        await writeMedia(thumb, img.thumb);
        out.push({ file, thumb, width: img.width, height: img.height, bytes: img.full.size, takenAt: img.takenAt });
      } catch (e) {
        toast({ text: 'Ein Foto konnte nicht übernommen werden', sub: e instanceof Error ? e.message : undefined, tone: 'bad' }, 6000);
      }
      busy.set((b) => (b ? { ...b, done: i + 1 } : b));
    }
    if (cancelled && out.length) {
      await discard(out);
      return [];
    }
    return out;
  } finally {
    busy.set(null);
  }
}

/** Throws away processed photos that were never attached (editor cancelled). */
export async function discard(photos: NewPhoto[]) {
  const names = photos.flatMap((p) => [p.file, p.thumb]);
  await removeMedia(names);
  clearPending(names);
}

async function acquire(source: 'camera' | 'gallery'): Promise<NewPhoto[]> {
  let picked: PickedImage[] = [];
  try {
    if (source === 'camera') {
      const one = await takePhoto();
      picked = one ? [one] : [];
    } else {
      picked = await pickPhotos();
    }
  } catch (e) {
    toast({ text: source === 'camera' ? 'Kamera nicht verfügbar' : 'Fotoauswahl fehlgeschlagen', sub: e instanceof Error ? e.message : undefined, tone: 'bad' }, 6000);
    return [];
  }
  if (!picked.length) return [];
  return store(picked);
}

/**
 * Entry point of the "+" button and of "Foto hinzufügen" on an item page.
 * With an item: photos go straight into it. Without: ask where they belong.
 */
export async function importPhotos(source: 'camera' | 'gallery', itemId: string | null) {
  closeSheet();
  const photos = await acquire(source);
  if (!photos.length) return;
  if (itemId) {
    attach(itemId, photos);
    return;
  }
  const hasItems = archive.get().items.some((it) => !it.deletedAt);
  if (hasItems) openSheet({ type: 'target', photos });
  else push({ type: 'editor', itemId: null, photos });
}

/** Adds processed photos to an existing item. */
export function attach(itemId: string, photos: NewPhoto[]) {
  let added: Photo[] = [];
  mutate((a, now) => {
    const res = addPhotos(a, itemId, photos, now);
    added = res.added;
    return res.archive;
  });
  clearPending(photos.flatMap((p) => [p.file, p.thumb]));
  haptic('success');
  const item = archive.get().items.find((it) => it.id === itemId);
  toast({ text: photos.length === 1 ? 'Foto hinzugefügt' : `${photos.length} Fotos hinzugefügt`, sub: item ? itemTitle(item) : undefined, tone: 'good' });
  void copyToAlbum(added);
}

/** Creates a new item (optionally with photos). Returns its id. */
export function createWithPhotos(draft: ItemDraft, photos: NewPhoto[]): string {
  let id = '';
  let added: Photo[] = [];
  mutate((a, now) => {
    const created = createItem(a, draft, now);
    id = created.item.id;
    const res = addPhotos(created.archive, id, photos, now);
    added = res.added;
    return res.archive;
  });
  clearPending(photos.flatMap((p) => [p.file, p.thumb]));
  haptic('success');
  void copyToAlbum(added);
  return id;
}

let albumWarned = false;

/** Copies photos into the phone album (if enabled). Failures are reported once. */
export async function copyToAlbum(photos: Photo[], force = false): Promise<number> {
  const a = archive.get();
  if (!albumSupported || (!a.settings.albumEnabled && !force) || !photos.length) return 0;
  const done: string[] = [];
  for (const p of photos) {
    const item = a.items.find((it) => it.id === p.itemId);
    try {
      await saveToAlbum(p.file, a.settings.albumName, albumFileName(item ? itemTitle(item) : 'simpleArchive', p.takenAt, p.id), p.takenAt);
      done.push(p.id);
    } catch (e) {
      if (!albumWarned || force) {
        albumWarned = true;
        toast({ text: 'Handy-Album nicht erreichbar', sub: e instanceof Error ? e.message : undefined, tone: 'bad' }, 6000);
      }
      break;
    }
  }
  if (done.length) {
    // No updatedAt bump: nothing that needs a backup changed.
    archive.set(markInAlbum(archive.get(), done));
    void flushSave();
  }
  return done.length;
}

/** Copies every photo that is not in the album yet (e.g. after a restore on a new phone). */
export async function copyAllToAlbum(): Promise<void> {
  const a = archive.get();
  const alive = new Set(a.items.filter((it) => !it.deletedAt).map((it) => it.id));
  const todo = a.photos.filter((p) => !p.deletedAt && !p.inAlbum && alive.has(p.itemId));
  if (!todo.length) {
    toast({ text: 'Alle Fotos sind schon im Handy-Album.', tone: 'info' });
    return;
  }
  busy.set({ title: `Fotos ins Album „${a.settings.albumName}“ kopieren`, done: 0, total: todo.length });
  let n = 0;
  try {
    for (const p of todo) {
      const ok = await copyToAlbum([p], true);
      if (!ok) break;
      busy.set((b) => (b ? { ...b, done: ++n } : b));
    }
  } finally {
    busy.set(null);
  }
  if (n) toast({ text: `${n} Fotos ins Handy-Album kopiert`, tone: 'good' });
}

/** Replaces a photo with an edited (cropped/rotated) version – as a new photo next to the original. */
export async function editAndAdd(photo: Photo): Promise<boolean> {
  let picked: PickedImage | null = null;
  try {
    picked = await editPhoto(photo.file);
  } catch (e) {
    toast({ text: 'Bearbeiten nicht möglich', sub: e instanceof Error ? e.message : undefined, tone: 'bad' }, 6000);
    return false;
  }
  if (!picked) return false;
  const [stored] = await store([{ ...picked, createdAt: null }]);
  if (!stored) return false;
  attach(photo.itemId, [{ ...stored, takenAt: photo.takenAt, caption: photo.caption }]);
  return true;
}

export const photoCount = (itemId: string) => photosOf(archive.get(), itemId).length;
