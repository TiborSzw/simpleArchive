import { useLayoutEffect, useState } from 'preact/hooks';
import { emptyArchive, purgeTrash } from '../core/archive';
import { nowLocal } from '../core/dates';
import { migrate } from '../core/migrate';
import type { Archive } from '../core/types';
import { initMedia, loadArchiveTexts, mediaFiles, removeMedia, saveArchiveText } from '../native/media';
import { isNative, kvGet, kvSet } from '../native/platform';

// ---------------------------------------------------------------------------
// Tiny observable store (no dependency needed).
// ---------------------------------------------------------------------------

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? (next as (p: T) => T)(value) : next;
      subs.forEach((fn) => fn());
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  const [, setTick] = useState(0);
  useLayoutEffect(() => store.subscribe(() => setTick((t) => t + 1)), [store]);
  return store.get();
}

// ---------------------------------------------------------------------------
// The archive
// ---------------------------------------------------------------------------

export const archive = createStore<Archive>(emptyArchive(nowLocal()));

/** true until the first save of a brand-new archive – shows the welcome screen. */
export const isFresh = createStore(false);

const changeListeners = new Set<() => void>();
export const onArchiveChange = (fn: () => void) => changeListeners.add(fn);

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> = Promise.resolve();
/** The archive has changes that have not reached storage yet. */
let dirty = false;
export const saveError = createStore<string | null>(null);

function scheduleSave() {
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), 350);
}

// Browser only: a page that closes right after a change may cut the async
// IndexedDB write short. A synchronous copy in localStorage bridges that gap.
const EMERGENCY_KEY = 'simplearchive.unsaved.v1';

export function emergencySave() {
  if (!dirty || isNative) return;
  try {
    localStorage.setItem(EMERGENCY_KEY, JSON.stringify(archive.get()));
  } catch {
    /* too big or storage blocked – the regular save is still running */
  }
}

function takeEmergencyCopy(): Archive | null {
  if (isNative) return null;
  try {
    const raw = localStorage.getItem(EMERGENCY_KEY);
    localStorage.removeItem(EMERGENCY_KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Writes the archive now (also called when the app goes to the background). */
export function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const snapshot = archive.get();
  const text = JSON.stringify(snapshot);
  saving = saving
    .then(() => saveArchiveText(text))
    .then(() => {
      if (archive.get() === snapshot) dirty = false;
      saveError.set(null);
    })
    .catch((e) => saveError.set(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.'));
  return saving;
}

/** Applies a change to the archive, saves it and notifies the backup scheduler. */
export function mutate(fn: (a: Archive, now: string) => Archive): Archive {
  const prev = archive.get();
  const next = fn(prev, nowLocal());
  if (next === prev) return prev;
  archive.set(next);
  isFresh.set(false);
  scheduleSave();
  changeListeners.forEach((l) => l());
  return next;
}

/** Replaces the whole archive (restore/import). */
export function replaceArchive(next: Archive) {
  archive.set(next);
  isFresh.set(false);
  void flushSave();
  changeListeners.forEach((l) => l());
}

export async function initStorage(): Promise<void> {
  await initMedia();
  let loaded: Archive | null = null;
  for (const text of await loadArchiveTexts()) {
    try {
      loaded = migrate(JSON.parse(text));
    } catch {
      loaded = null;
    }
    if (loaded) break;
  }
  const rescued = takeEmergencyCopy();
  if (rescued && (!loaded || (rescued.id === loaded.id && rescued.updatedAt > loaded.updatedAt))) {
    loaded = rescued;
    dirty = true;
  }
  if (loaded) {
    // Trash older than 30 days goes for good.
    const purged = purgeTrash(loaded, nowLocal());
    archive.set(purged.archive);
    if (purged.files.length) void removeMedia(purged.files);
    if (purged.files.length || dirty) void flushSave();
  } else {
    archive.set(emptyArchive(nowLocal()));
    isFresh.set(true);
  }
  await cleanPending();
}

// ---------------------------------------------------------------------------
// Files of an import that has not been saved yet. If the app dies mid-import
// they are removed at the next start. Any other unreferenced photo is never
// deleted automatically – it can be rescued in the settings.
// ---------------------------------------------------------------------------

const PENDING_KEY = 'simplearchive.pending.v1';
let pending = new Set<string>();

export function addPending(names: string[]) {
  names.forEach((n) => pending.add(n));
  kvSet(PENDING_KEY, JSON.stringify([...pending]));
}

export function clearPending(names: string[]) {
  names.forEach((n) => pending.delete(n));
  kvSet(PENDING_KEY, pending.size ? JSON.stringify([...pending]) : null);
}

async function cleanPending() {
  try {
    pending = new Set(JSON.parse((await kvGet(PENDING_KEY)) ?? '[]') as string[]);
  } catch {
    pending = new Set();
  }
  if (!pending.size) return;
  const used = new Set(archive.get().photos.flatMap((p) => [p.file, p.thumb]));
  const stale = [...pending].filter((f) => !used.has(f));
  if (stale.length) await removeMedia(stale);
  clearPending([...pending]);
}

/** Full-size photo files on the device that no photo entry refers to. */
export function orphanPhotos(): string[] {
  const used = new Set(archive.get().photos.flatMap((p) => [p.file, p.thumb]));
  return [...mediaFiles()].filter((f) => f.startsWith('p_') && !used.has(f) && !pending.has(f)).sort();
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export interface Toast {
  id: number;
  text: string;
  sub?: string;
  tone?: 'good' | 'bad' | 'info';
  action?: { label: string; run: () => void };
}

export const toasts = createStore<Toast[]>([]);
let toastId = 0;

export function toast(t: Omit<Toast, 'id'>, ms = 3500): number {
  const id = ++toastId;
  toasts.set((list) => [...list.slice(-2), { ...t, id }]);
  setTimeout(() => dismissToast(id), ms);
  return id;
}

export const dismissToast = (id: number) => toasts.set((list) => list.filter((t) => t.id !== id));

// ---------------------------------------------------------------------------
// Busy overlay (imports, restores, exports)
// ---------------------------------------------------------------------------

export interface Busy {
  title: string;
  detail?: string;
  done?: number;
  total?: number;
  cancel?: () => void;
}

export const busy = createStore<Busy | null>(null);
