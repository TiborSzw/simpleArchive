// Backup glue between the sync engine and the UI: settings, status, automatic
// backups, restore and ZIP transfer. Credentials live in their own storage key
// and are never part of the archive or a backup.
import { nowLocal } from '../core/dates';
import { migrate } from '../core/migrate';
import type { Archive } from '../core/types';
import { DriveStore } from '../sync/drive';
import type { RemoteStore } from '../sync/http';
import { CancelledError, ForeignArchiveError, inspectRemote, listRestorePoints, readRestorePoint, restoreMedia, runBackup, type Progress, type RemoteSummary, type RestorePoint } from '../sync/sync';
import { DavStore } from '../sync/webdav';
import { connectGoogle, disconnectGoogle, driveToken, driveSupported } from '../native/google';
import { transport } from '../native/http';
import { initMedia, mediaFiles } from '../native/media';
import { connection, isNative, kvGet, kvSet } from '../native/platform';
import { exportZip, importZip, isZipCancel } from '../native/zip';
import { archive, busy, createStore, replaceArchive, toast } from './store';

export type TargetId = 'nextcloud' | 'gdrive';

export interface CloudSettings {
  nextcloud: { enabled: boolean; url: string; user: string; password: string; folder: string };
  gdrive: { enabled: boolean; folder: string; email: string | null };
  /** Back up automatically after changes and when leaving the app. */
  auto: boolean;
  /** Automatic backups only on Wi-Fi (manual ones always run). */
  wifiOnly: boolean;
  /** Daily snapshots of the archive file to keep. */
  keep: number;
}

export interface TargetStatus {
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  /** "<archive id>@<updatedAt>" of the last successful backup. */
  syncedVersion: string | null;
  /** The backup folder holds a different archive – auto backup pauses until resolved. */
  foreign: RemoteSummary | null;
}

export interface CloudState {
  busy: TargetId | null;
  progress: Progress | null;
  status: Record<TargetId, TargetStatus>;
}

const SETTINGS_KEY = 'simplearchive.cloud.settings.v1';
const STATUS_KEY = 'simplearchive.cloud.status.v1';

export const DEFAULT_CLOUD: CloudSettings = {
  nextcloud: { enabled: false, url: '', user: '', password: '', folder: 'simpleArchive' },
  gdrive: { enabled: false, folder: 'simpleArchive', email: null },
  auto: true,
  wifiOnly: true,
  keep: 30,
};

const emptyStatus = (): TargetStatus => ({ lastSuccessAt: null, lastError: null, lastErrorAt: null, syncedVersion: null, foreign: null });

export const cloudSettings = createStore<CloudSettings>(DEFAULT_CLOUD);
export const cloud = createStore<CloudState>({ busy: null, progress: null, status: { nextcloud: emptyStatus(), gdrive: emptyStatus() } });

export const TARGET_LABEL: Record<TargetId, string> = { nextcloud: 'Nextcloud', gdrive: 'Google Drive' };

/** Nextcloud needs native HTTP (CORS); Drive needs the native Google sign-in. */
export const cloudWorksHere = isNative;
export { driveSupported };

export async function initCloud() {
  const [settings, status] = await Promise.all([kvGet(SETTINGS_KEY), kvGet(STATUS_KEY)]);
  try {
    if (settings) {
      const s = JSON.parse(settings) as Partial<CloudSettings>;
      cloudSettings.set({
        ...DEFAULT_CLOUD,
        ...s,
        nextcloud: { ...DEFAULT_CLOUD.nextcloud, ...(s.nextcloud ?? {}) },
        gdrive: { ...DEFAULT_CLOUD.gdrive, ...(s.gdrive ?? {}) },
      });
    }
  } catch {
    /* ignore broken settings */
  }
  try {
    if (status) {
      const s = JSON.parse(status) as Partial<Record<TargetId, Partial<TargetStatus>>>;
      cloud.set((c) => ({ ...c, status: { nextcloud: { ...emptyStatus(), ...(s.nextcloud ?? {}) }, gdrive: { ...emptyStatus(), ...(s.gdrive ?? {}) } } }));
    }
  } catch {
    /* ignore */
  }
}

export function saveCloudSettings(patch: Partial<CloudSettings>) {
  const next = { ...cloudSettings.get(), ...patch };
  cloudSettings.set(next);
  kvSet(SETTINGS_KEY, JSON.stringify(next));
}

function setStatus(target: TargetId, patch: Partial<TargetStatus>) {
  cloud.set((c) => ({ ...c, status: { ...c.status, [target]: { ...c.status[target], ...patch } } }));
  kvSet(STATUS_KEY, JSON.stringify(cloud.get().status));
}

export const nextcloudConfigured = (s = cloudSettings.get()) => !!(s.nextcloud.url.trim() && s.nextcloud.user.trim() && s.nextcloud.password);

export function targetEnabled(t: TargetId, s = cloudSettings.get()): boolean {
  return t === 'nextcloud' ? s.nextcloud.enabled && nextcloudConfigured(s) : s.gdrive.enabled;
}

export function storeFor(t: TargetId, s = cloudSettings.get()): RemoteStore {
  if (t === 'nextcloud') return new DavStore(s.nextcloud, transport);
  return new DriveStore(s.gdrive.folder, driveToken, transport);
}

const versionOf = (a: Archive) => `${a.id}@${a.updatedAt}`;

export function isBackedUp(t: TargetId): boolean {
  return cloud.get().status[t].syncedVersion === versionOf(archive.get());
}

let cancelRequested = false;
export const cancelCloud = () => (cancelRequested = true);

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Unbekannter Fehler.');

/** Runs one backup. Manual runs report success and errors as toasts. */
export async function backupNow(t: TargetId, mode: 'manual' | 'auto', force = false): Promise<boolean> {
  if (cloud.get().busy) return false;
  const a = archive.get();
  cancelRequested = false;
  cloud.set((c) => ({ ...c, busy: t, progress: { phase: 'check', done: 0, total: 0 } }));
  try {
    const res = await runBackup(storeFor(t), a, {
      now: nowLocal(),
      keep: cloudSettings.get().keep,
      force,
      onProgress: (p) => cloud.set((c) => ({ ...c, progress: p })),
      isCancelled: () => cancelRequested,
    });
    setStatus(t, { lastSuccessAt: nowLocal(), lastError: null, lastErrorAt: null, syncedVersion: versionOf(a), foreign: null });
    if (mode === 'manual')
      toast({ text: `Backup in ${TARGET_LABEL[t]} gespeichert`, sub: res.uploaded ? `${res.uploaded} neue Dateien hochgeladen` : 'Alles war schon gesichert.', tone: 'good' });
    return true;
  } catch (e) {
    if (e instanceof CancelledError) {
      toast({ text: 'Backup abgebrochen', tone: 'info' });
      return false;
    }
    if (e instanceof ForeignArchiveError) setStatus(t, { foreign: e.remote, lastError: e.message, lastErrorAt: nowLocal() });
    else setStatus(t, { lastError: errorText(e), lastErrorAt: nowLocal() });
    if (mode === 'manual' && !(e instanceof ForeignArchiveError)) toast({ text: 'Backup fehlgeschlagen', sub: errorText(e), tone: 'bad' }, 7000);
    return false;
  } finally {
    cloud.set((c) => ({ ...c, busy: null, progress: null }));
  }
}

// ---------------------------------------------------------------------------
// Automatic backups
// ---------------------------------------------------------------------------

let autoTimer: ReturnType<typeof setTimeout> | null = null;
const lastAutoFailure: Record<TargetId, number> = { nextcloud: 0, gdrive: 0 };

/** Called after every change: backs up ~30 s after the last change. */
export function scheduleAutoBackup(delayMs = 30_000) {
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(() => void autoBackup(), delayMs);
}

export async function autoBackup(): Promise<void> {
  autoTimer = null;
  const s = cloudSettings.get();
  if (!s.auto || !cloudWorksHere || cloud.get().busy) return;
  const targets = (['nextcloud', 'gdrive'] as TargetId[]).filter((t) => targetEnabled(t, s) && !isBackedUp(t) && !cloud.get().status[t].foreign);
  if (!targets.length) return;
  const conn = await connection();
  if (conn === 'none' || (s.wifiOnly && conn === 'cellular')) return;
  for (const t of targets) {
    // After a failure, wait 10 minutes before trying automatically again.
    if (Date.now() - lastAutoFailure[t] < 10 * 60_000) continue;
    const ok = await backupNow(t, 'auto');
    if (!ok) lastAutoFailure[t] = Date.now();
  }
}

// ---------------------------------------------------------------------------
// Connecting & restoring
// ---------------------------------------------------------------------------

export async function inspect(t: TargetId, s = cloudSettings.get()): Promise<RemoteSummary | null> {
  return inspectRemote(storeFor(t, s));
}

export async function connectDrive(): Promise<string | null> {
  const { email } = await connectGoogle();
  let account = email;
  if (!account) {
    try {
      account = (await (storeFor('gdrive') as DriveStore).account()).email || null;
    } catch {
      /* not important */
    }
  }
  saveCloudSettings({ gdrive: { ...cloudSettings.get().gdrive, enabled: true, email: account } });
  setStatus('gdrive', { ...emptyStatus() });
  return account;
}

export async function disconnectDrive() {
  await disconnectGoogle(cloudSettings.get().gdrive.email);
  saveCloudSettings({ gdrive: { ...cloudSettings.get().gdrive, enabled: false, email: null } });
  setStatus('gdrive', emptyStatus());
}

export function disconnectNextcloud() {
  saveCloudSettings({ nextcloud: { ...cloudSettings.get().nextcloud, enabled: false, password: '' } });
  setStatus('nextcloud', emptyStatus());
}

export const restorePoints = (t: TargetId): Promise<RestorePoint[]> => listRestorePoints(storeFor(t));

/** Replaces the local archive with a backup and downloads the missing photos. */
export async function restoreFrom(t: TargetId, point: RestorePoint): Promise<boolean> {
  if (cloud.get().busy) return false;
  cancelRequested = false;
  cloud.set((c) => ({ ...c, busy: t, progress: { phase: 'check', done: 0, total: 0 } }));
  busy.set({ title: `Wiederherstellen aus ${TARGET_LABEL[t]}`, detail: 'Backup wird gelesen …', cancel: () => (cancelRequested = true) });
  try {
    const store = storeFor(t);
    const restored = await readRestorePoint(store, point);
    const res = await restoreMedia(store, restored, mediaFiles(), {
      now: nowLocal(),
      isCancelled: () => cancelRequested,
      onProgress: (p) => {
        cloud.set((c) => ({ ...c, progress: p }));
        if (p.phase === 'download') busy.set((b) => (b ? { ...b, detail: 'Fotos werden geladen', done: p.done, total: p.total } : b));
      },
    });
    replaceArchive(res.archive);
    // What we just restored is exactly what the server has.
    const synced = point.day === null && res.missing === 0 ? versionOf(res.archive) : null;
    setStatus(t, { syncedVersion: synced, foreign: null, lastError: null, lastErrorAt: null, lastSuccessAt: cloud.get().status[t].lastSuccessAt });
    for (const other of ['nextcloud', 'gdrive'] as TargetId[]) if (other !== t) setStatus(other, { foreign: null });
    toast({
      text: 'Archiv wiederhergestellt',
      sub: `${res.archive.items.filter((it) => !it.deletedAt).length} Werke, ${res.downloaded} Dateien geladen${res.missing ? ` · ${res.missing} Fotos fehlten im Backup` : ''}`,
      tone: 'good',
    }, 6000);
    return true;
  } catch (e) {
    toast({ text: 'Wiederherstellen fehlgeschlagen', sub: errorText(e), tone: 'bad' }, 7000);
    return false;
  } finally {
    busy.set(null);
    cloud.set((c) => ({ ...c, busy: null, progress: null }));
  }
}

// ---------------------------------------------------------------------------
// ZIP (any destination via the system dialog – e.g. Google Drive without setup)
// ---------------------------------------------------------------------------

export async function exportArchiveZip(): Promise<void> {
  const a = archive.get();
  busy.set({ title: 'ZIP wird erstellt', detail: 'Ziel auswählen …' });
  try {
    const res = await exportZip(a, `simpleArchive-${nowLocal().slice(0, 10)}.zip`, (p) =>
      busy.set((b) => (b ? { ...b, detail: 'Fotos werden verpackt', done: p.done, total: p.total } : b)),
    );
    toast({ text: 'Archiv als ZIP gespeichert', sub: `${res.files} Dateien, ${(res.bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`, tone: 'good' }, 5000);
  } catch (e) {
    if (!isZipCancel(e)) toast({ text: 'ZIP-Export fehlgeschlagen', sub: errorText(e), tone: 'bad' }, 7000);
  } finally {
    busy.set(null);
  }
}

/** Reads a ZIP export; returns the archive in it (not applied yet) or null. */
export async function readArchiveZip(): Promise<Archive | null> {
  busy.set({ title: 'ZIP wird gelesen', detail: 'Datei auswählen …' });
  try {
    const res = await importZip((p) => busy.set((b) => (b ? { ...b, detail: `${p.done} Fotos entpackt` } : b)));
    await initMedia();
    let data: unknown;
    try {
      data = JSON.parse(res.json);
    } catch {
      throw new Error('archive.json im ZIP ist beschädigt.');
    }
    const a = migrate(data);
    if (!a) throw new Error('Das ZIP enthält kein simpleArchive.');
    return a;
  } catch (e) {
    if (!isZipCancel(e)) toast({ text: 'ZIP-Import fehlgeschlagen', sub: errorText(e), tone: 'bad' }, 7000);
    return null;
  } finally {
    busy.set(null);
  }
}

export function applyImportedArchive(a: Archive) {
  const files = mediaFiles();
  const photos = a.photos.filter((p) => files.has(p.file) || files.has(p.thumb)).map((p) => (files.has(p.file) ? (files.has(p.thumb) ? p : { ...p, thumb: p.file }) : { ...p, file: p.thumb }));
  replaceArchive({ ...a, photos });
  toast({ text: 'Archiv importiert', sub: `${a.items.filter((it) => !it.deletedAt).length} Werke, ${photos.length} Fotos`, tone: 'good' }, 5000);
}
