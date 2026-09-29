// Backup & restore engine – works with any RemoteStore (Nextcloud, Google Drive).
//
// Remote layout:
//   <folder>/archive.json                 the newest archive (items, photos, settings)
//   <folder>/history/archive-<day>.json   one snapshot per day, rotated
//   <folder>/photos/p_….jpg               full images (uploaded once, never changed)
//   <folder>/thumbs/t_….jpg               thumbnails
//
// Backups are incremental: photo files are immutable, so only files missing on
// the server are uploaded. Photos are uploaded before archive.json, so the
// metadata on the server never points at a missing file.
import { dayOf } from '../core/dates';
import { migrate } from '../core/migrate';
import type { Archive, Photo } from '../core/types';
import { RemoteError, type RemoteDir, type RemoteFile, type RemoteStore } from './http';

export const ARCHIVE_FILE = 'archive.json';
const SNAPSHOT_RE = /^archive-(\d{4}-\d{2}-\d{2})\.json$/;
/** Only files that look like ours are ever deleted on the server. */
const MEDIA_RE = /^[pt]_[\w.-]+\.jpe?g$/i;

export const snapshotName = (day: string) => `archive-${day}.json`;

export interface Progress {
  phase: 'check' | 'upload' | 'meta' | 'cleanup' | 'download';
  done: number;
  total: number;
}

export interface SyncOptions {
  /** Local ISO date-time. */
  now: string;
  onProgress?: (p: Progress) => void;
  isCancelled?: () => boolean;
  /** Parallel transfers. */
  concurrency?: number;
}

export interface BackupOptions extends SyncOptions {
  /** Daily snapshots to keep. */
  keep: number;
  /** Overwrite a backup folder that belongs to a different archive. */
  force?: boolean;
}

export interface BackupResult {
  uploaded: number;
  uploadedBytes: number;
  removed: number;
  snapshot: string;
}

export interface RemoteSummary {
  id: string;
  items: number;
  photos: number;
  updatedAt: string;
}

/** The backup folder already holds a different archive (e.g. a fresh install before restoring). */
export class ForeignArchiveError extends RemoteError {
  constructor(public remote: RemoteSummary) {
    super(`Im Backup-Ordner liegt ein anderes Archiv (${remote.items} Werke, ${remote.photos} Fotos). Erst wiederherstellen – oder bewusst überschreiben.`);
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Abgebrochen.');
  }
}

function summarize(a: Archive): RemoteSummary {
  return {
    id: a.id,
    items: a.items.filter((it) => !it.deletedAt).length,
    photos: a.photos.filter((p) => !p.deletedAt).length,
    updatedAt: a.updatedAt,
  };
}

function parseArchive(text: string): Archive {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RemoteError('Die Backup-Datei ist beschädigt (kein gültiges JSON).');
  }
  const a = migrate(data);
  if (!a) throw new RemoteError('Die Datei ist kein simpleArchive-Backup.');
  return a;
}

/** Runs tasks with limited parallelism; stops at the first error or on cancel. */
async function pool<T>(items: T[], concurrency: number, isCancelled: (() => boolean) | undefined, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed: unknown = null;
  const worker = async () => {
    while (next < items.length && !failed) {
      if (isCancelled?.()) {
        failed = failed ?? new CancelledError();
        return;
      }
      const item = items[next++];
      try {
        await run(item);
      } catch (e) {
        failed = failed ?? e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  if (failed) throw failed;
}

/** Checks the connection and tells what is already in the backup folder. */
export async function inspectRemote(store: RemoteStore): Promise<RemoteSummary | null> {
  await store.prepare();
  const text = await store.getText('', ARCHIVE_FILE);
  return text ? summarize(parseArchive(text)) : null;
}

export async function runBackup(store: RemoteStore, archive: Archive, opts: BackupOptions): Promise<BackupResult> {
  const progress = opts.onProgress ?? (() => undefined);
  progress({ phase: 'check', done: 0, total: 0 });
  await store.prepare();

  const remoteText = await store.getText('', ARCHIVE_FILE);
  if (remoteText && !opts.force) {
    const remote = parseArchive(remoteText);
    const summary = summarize(remote);
    if (remote.id !== archive.id && (summary.items > 0 || summary.photos > 0)) throw new ForeignArchiveError(summary);
  }

  const [remotePhotos, remoteThumbs] = await Promise.all([store.list('photos'), store.list('thumbs')]);
  const have: Record<'photos' | 'thumbs', Set<string>> = {
    photos: new Set(remotePhotos.filter((f) => f.size > 0).map((f) => f.name)),
    thumbs: new Set(remoteThumbs.filter((f) => f.size > 0).map((f) => f.name)),
  };

  // Everything the archive references – including the trash, so a restore brings it back.
  const uploads: { dir: 'photos' | 'thumbs'; name: string; bytes: number }[] = [];
  const queued = new Set<string>();
  for (const p of archive.photos) {
    if (!have.photos.has(p.file) && !queued.has(`photos/${p.file}`)) {
      queued.add(`photos/${p.file}`);
      uploads.push({ dir: 'photos', name: p.file, bytes: p.bytes });
    }
    if (p.thumb !== p.file && !have.thumbs.has(p.thumb) && !queued.has(`thumbs/${p.thumb}`)) {
      queued.add(`thumbs/${p.thumb}`);
      uploads.push({ dir: 'thumbs', name: p.thumb, bytes: 0 });
    }
  }

  let done = 0;
  let uploadedBytes = 0;
  progress({ phase: 'upload', done, total: uploads.length });
  await pool(uploads, opts.concurrency ?? 3, opts.isCancelled, async (u) => {
    await store.putFile(u.dir, u.name, u.name);
    uploadedBytes += u.bytes;
    progress({ phase: 'upload', done: ++done, total: uploads.length });
  });
  if (opts.isCancelled?.()) throw new CancelledError();

  progress({ phase: 'meta', done: 0, total: 1 });
  const json = JSON.stringify(archive);
  await store.putText('', ARCHIVE_FILE, json);
  const snapshot = snapshotName(dayOf(opts.now));
  await store.putText('history', snapshot, json);

  // Cleanup is best effort – the backup itself already succeeded.
  let removed = 0;
  try {
    progress({ phase: 'cleanup', done: 0, total: 0 });
    const referenced = { photos: new Set(archive.photos.map((p) => p.file)), thumbs: new Set(archive.photos.map((p) => p.thumb)) };
    const stale: { dir: RemoteDir; name: string }[] = [
      ...remotePhotos.filter((f) => MEDIA_RE.test(f.name) && !referenced.photos.has(f.name)).map((f) => ({ dir: 'photos' as const, name: f.name })),
      ...remoteThumbs.filter((f) => MEDIA_RE.test(f.name) && !referenced.thumbs.has(f.name)).map((f) => ({ dir: 'thumbs' as const, name: f.name })),
    ];
    const snapshots = (await store.list('history')).filter((f) => SNAPSHOT_RE.test(f.name)).sort((x, y) => y.name.localeCompare(x.name));
    for (const f of snapshots.slice(Math.max(1, opts.keep))) stale.push({ dir: 'history', name: f.name });
    for (const f of stale) {
      await store.remove(f.dir, f.name);
      removed++;
    }
  } catch {
    /* ignore */
  }

  return { uploaded: uploads.length, uploadedBytes, removed, snapshot };
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

export interface RestorePoint {
  dir: RemoteDir;
  name: string;
  /** Day of the snapshot, null for the newest archive.json. */
  day: string | null;
  size: number;
  modified: string | null;
}

/** archive.json first, then the daily snapshots, newest first. */
export async function listRestorePoints(store: RemoteStore): Promise<RestorePoint[]> {
  const [root, history] = await Promise.all([store.list(''), store.list('history')]);
  const points: RestorePoint[] = [];
  const current = root.find((f: RemoteFile) => f.name === ARCHIVE_FILE);
  if (current) points.push({ dir: '', name: current.name, day: null, size: current.size, modified: current.modified });
  for (const f of history.filter((f) => SNAPSHOT_RE.test(f.name)).sort((x, y) => y.name.localeCompare(x.name)))
    points.push({ dir: 'history', name: f.name, day: SNAPSHOT_RE.exec(f.name)![1], size: f.size, modified: f.modified });
  return points;
}

export async function readRestorePoint(store: RemoteStore, point: Pick<RestorePoint, 'dir' | 'name'>): Promise<Archive> {
  const text = await store.getText(point.dir, point.name);
  if (text === null) throw new RemoteError('Das Backup wurde nicht gefunden.', 404);
  return parseArchive(text);
}

export interface RestoreResult {
  archive: Archive;
  downloaded: number;
  /** Photos whose image could not be found anywhere and were dropped. */
  missing: number;
}

/**
 * Downloads every image the archive needs and that is not on this device yet.
 * `localFiles` are the media files already present locally.
 */
export async function restoreMedia(store: RemoteStore, archive: Archive, localFiles: Set<string>, opts: SyncOptions): Promise<RestoreResult> {
  const progress = opts.onProgress ?? (() => undefined);
  progress({ phase: 'check', done: 0, total: 0 });
  const [remotePhotos, remoteThumbs] = await Promise.all([store.list('photos'), store.list('thumbs')]);
  const remote = { photos: new Set(remotePhotos.map((f) => f.name)), thumbs: new Set(remoteThumbs.map((f) => f.name)) };
  const available = new Set(localFiles);

  const downloads: { dir: 'photos' | 'thumbs'; name: string }[] = [];
  const queued = new Set<string>();
  const want = (dir: 'photos' | 'thumbs', name: string) => {
    if (available.has(name) || queued.has(name) || !remote[dir].has(name)) return;
    queued.add(name);
    downloads.push({ dir, name });
  };
  for (const p of archive.photos) {
    want('photos', p.file);
    want('thumbs', p.thumb);
  }

  let done = 0;
  progress({ phase: 'download', done, total: downloads.length });
  await pool(downloads, opts.concurrency ?? 3, opts.isCancelled, async (d) => {
    await store.getFile(d.dir, d.name, d.name);
    available.add(d.name);
    progress({ phase: 'download', done: ++done, total: downloads.length });
  });

  // Fall back to whatever image exists; drop photos without any image.
  let missing = 0;
  const photos: Photo[] = [];
  for (const p of archive.photos) {
    const hasFile = available.has(p.file);
    const hasThumb = available.has(p.thumb);
    if (hasFile && hasThumb) photos.push(p);
    else if (hasFile) photos.push({ ...p, thumb: p.file });
    else if (hasThumb) photos.push({ ...p, file: p.thumb });
    else missing++;
  }
  const kept = new Set(photos.map((p) => p.id));
  const items = archive.items.map((it) => (it.coverId && !kept.has(it.coverId) ? { ...it, coverId: null } : it));
  return { archive: { ...archive, items, photos }, downloaded: downloads.length, missing };
}
