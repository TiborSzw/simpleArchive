// Photo files and the archive file.
//   Android: app storage (files/media/photos, files/media/thumbs, files/archive.json),
//            shown in the WebView via Capacitor's local file server – no base64 round trips.
//   Browser: IndexedDB (blobs + archive text), shown via object URLs.
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { isNative } from './platform';

const subdir = (name: string) => (name.startsWith('t_') ? 'thumbs' : 'photos');

let nativeBase = ''; // file:///data/user/0/…/files/media
const present = new Set<string>();
const objectUrls = new Map<string, string>();

// ---------------------------------------------------------------------------
// IndexedDB (browser)
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('simplearchive', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('media');
        req.result.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB nicht verfügbar.'));
    });
  return dbPromise;
}

async function idb<T>(store: 'media' | 'kv', mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = run(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB-Fehler.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abgebrochen (Speicher voll?).'));
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Datei nicht lesbar.'));
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Media API
// ---------------------------------------------------------------------------

/** Loads the list of existing files. Call once at start. */
export async function initMedia(): Promise<void> {
  present.clear();
  if (isNative) {
    nativeBase = (await Filesystem.getUri({ directory: Directory.Data, path: 'media' })).uri.replace(/\/+$/, '');
    for (const dir of ['photos', 'thumbs']) {
      try {
        const { files } = await Filesystem.readdir({ directory: Directory.Data, path: `media/${dir}` });
        for (const f of files) if (f.type === 'file' && !f.name.endsWith('.part')) present.add(f.name);
      } catch {
        await Filesystem.mkdir({ directory: Directory.Data, path: `media/${dir}`, recursive: true }).catch(() => undefined);
      }
    }
    return;
  }
  const keys = await idb<IDBValidKey[]>('media', 'readonly', (s) => s.getAllKeys());
  for (const k of keys) present.add(String(k));
}

export const mediaFiles = (): Set<string> => new Set(present);
export const hasMedia = (name: string) => present.has(name);

/** Marks a file as present after something else (a download) wrote it. */
export const markPresent = (name: string) => present.add(name);

/** Absolute native path (file://…) of a media file – for native plugins. */
export function mediaPath(name: string): string {
  return `${nativeBase}/${subdir(name)}/${name}`;
}

export async function writeMedia(name: string, blob: Blob): Promise<void> {
  if (isNative) {
    await Filesystem.writeFile({ directory: Directory.Data, path: `media/${subdir(name)}/${name}`, data: await blobToBase64(blob), recursive: true });
  } else {
    await idb('media', 'readwrite', (s) => s.put(blob, name));
  }
  present.add(name);
}

export async function readMedia(name: string): Promise<Blob> {
  if (isNative) {
    const res = await fetch(Capacitor.convertFileSrc(mediaPath(name)));
    if (!res.ok) throw new Error(`Foto fehlt: ${name}`);
    return res.blob();
  }
  const blob = await idb<Blob | undefined>('media', 'readonly', (s) => s.get(name));
  if (!blob) throw new Error(`Foto fehlt: ${name}`);
  return blob;
}

export async function removeMedia(names: string[]): Promise<void> {
  for (const name of names) {
    present.delete(name);
    const url = objectUrls.get(name);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrls.delete(name);
    }
    try {
      if (isNative) await Filesystem.deleteFile({ directory: Directory.Data, path: `media/${subdir(name)}/${name}` });
      else await idb('media', 'readwrite', (s) => s.delete(name));
    } catch {
      /* already gone */
    }
  }
}

/** Display URL if it can be produced synchronously (always on Android). */
export function mediaUrlSync(name: string): string | null {
  if (isNative) return Capacitor.convertFileSrc(mediaPath(name));
  return objectUrls.get(name) ?? null;
}

export async function mediaUrl(name: string): Promise<string> {
  const sync = mediaUrlSync(name);
  if (sync) return sync;
  const url = URL.createObjectURL(await readMedia(name));
  objectUrls.set(name, url);
  return url;
}

/** Copies a media file into the cache under a friendly name (for sharing); returns its URI. */
export async function cacheCopy(name: string, friendlyName: string): Promise<string> {
  if (!isNative) throw new Error('Nur in der App.');
  await Filesystem.mkdir({ directory: Directory.Cache, path: 'share', recursive: true }).catch(() => undefined);
  await Filesystem.deleteFile({ directory: Directory.Cache, path: `share/${friendlyName}` }).catch(() => undefined);
  await Filesystem.copy({ from: `media/${subdir(name)}/${name}`, directory: Directory.Data, to: `share/${friendlyName}`, toDirectory: Directory.Cache });
  return (await Filesystem.getUri({ directory: Directory.Cache, path: `share/${friendlyName}` })).uri;
}

/** Writes a blob into the cache (e.g. a rendered showcase card); returns its URI. */
export async function cacheWrite(friendlyName: string, blob: Blob): Promise<string> {
  const { uri } = await Filesystem.writeFile({ directory: Directory.Cache, path: `share/${friendlyName}`, data: await blobToBase64(blob), recursive: true });
  return uri;
}

export async function clearShareCache(): Promise<void> {
  if (!isNative) return;
  await Filesystem.rmdir({ directory: Directory.Cache, path: 'share', recursive: true }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// The archive file
// ---------------------------------------------------------------------------

const ARCHIVE = 'archive.json';
const ARCHIVE_NEW = 'archive.new.json';
const ARCHIVE_PREV = 'archive.prev.json';

async function readText(path: string): Promise<string | null> {
  try {
    const { data } = await Filesystem.readFile({ directory: Directory.Data, path, encoding: Encoding.UTF8 });
    return typeof data === 'string' ? data : await (data as Blob).text();
  } catch {
    return null;
  }
}

/** Newest readable archive text: the file, an interrupted save, or the previous version. */
export async function loadArchiveTexts(): Promise<string[]> {
  if (!isNative) {
    const [cur, prev] = await Promise.all([
      idb<string | undefined>('kv', 'readonly', (s) => s.get(ARCHIVE)),
      idb<string | undefined>('kv', 'readonly', (s) => s.get(ARCHIVE_PREV)),
    ]);
    return [cur, prev].filter((x): x is string => !!x);
  }
  const texts = await Promise.all([readText(ARCHIVE), readText(ARCHIVE_NEW), readText(ARCHIVE_PREV)]);
  return texts.filter((x): x is string => !!x);
}

let keptPrevious = false;

/** Saves the archive: write new file, then swap – an interrupted save never destroys the last good copy. */
export async function saveArchiveText(text: string): Promise<void> {
  if (!isNative) {
    if (!keptPrevious) {
      const cur = await idb<string | undefined>('kv', 'readonly', (s) => s.get(ARCHIVE));
      if (cur) await idb('kv', 'readwrite', (s) => s.put(cur, ARCHIVE_PREV));
      keptPrevious = true;
    }
    await idb('kv', 'readwrite', (s) => s.put(text, ARCHIVE));
    return;
  }
  if (!keptPrevious) {
    // Once per app start: keep the last version from before this session.
    await Filesystem.deleteFile({ directory: Directory.Data, path: ARCHIVE_PREV }).catch(() => undefined);
    await Filesystem.copy({ from: ARCHIVE, directory: Directory.Data, to: ARCHIVE_PREV, toDirectory: Directory.Data }).catch(() => undefined);
    keptPrevious = true;
  }
  await Filesystem.writeFile({ directory: Directory.Data, path: ARCHIVE_NEW, data: text, encoding: Encoding.UTF8 });
  await Filesystem.deleteFile({ directory: Directory.Data, path: ARCHIVE }).catch(() => undefined);
  await Filesystem.rename({ from: ARCHIVE_NEW, to: ARCHIVE, directory: Directory.Data, toDirectory: Directory.Data });
}
