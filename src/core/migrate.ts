// Validates archive JSON (from storage, a backup or an import) and fills in
// defaults, so older or hand-edited files never crash the app.
import { KINDS, STATUSES } from './constants';
import { newId } from './ids';
import { DEFAULT_SETTINGS, type Archive, type ArchiveSettings, type Item, type Kind, type Photo, type Status } from './types';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);

function item(v: unknown, now: string): Item | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const status = STATUSES.includes(v.status as Status) ? (v.status as Status) : 'unpainted';
  return {
    id: v.id,
    name: str(v.name),
    kind: KINDS.includes(v.kind as Kind) ? (v.kind as Kind) : 'other',
    status,
    tags: Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [],
    favorite: bool(v.favorite),
    notes: str(v.notes),
    models: Math.max(1, Math.round(num(v.models, 1))),
    coverId: strOrNull(v.coverId),
    createdAt: str(v.createdAt, now),
    updatedAt: str(v.updatedAt, now),
    startedAt: strOrNull(v.startedAt),
    finishedAt: status === 'done' ? (strOrNull(v.finishedAt) ?? str(v.updatedAt, now)) : null,
    deletedAt: strOrNull(v.deletedAt),
  };
}

function photo(v: unknown, now: string): Photo | null {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.itemId !== 'string' || typeof v.file !== 'string' || !v.file) return null;
  return {
    id: v.id,
    itemId: v.itemId,
    file: v.file,
    thumb: str(v.thumb, v.file),
    width: num(v.width, 0),
    height: num(v.height, 0),
    bytes: num(v.bytes, 0),
    takenAt: str(v.takenAt, str(v.addedAt, now)),
    addedAt: str(v.addedAt, now),
    caption: str(v.caption),
    stage: STATUSES.includes(v.stage as Status) ? (v.stage as Status) : 'done',
    inAlbum: bool(v.inAlbum),
    deletedAt: strOrNull(v.deletedAt),
  };
}

function settings(v: unknown): ArchiveSettings {
  const s = isObj(v) ? v : {};
  const theme = s.theme === 'dark' || s.theme === 'light' ? s.theme : 'auto';
  return {
    painterName: str(s.painterName, DEFAULT_SETTINGS.painterName),
    theme,
    maxEdge: Math.min(8192, Math.max(1024, num(s.maxEdge, DEFAULT_SETTINGS.maxEdge))),
    albumEnabled: bool(s.albumEnabled, DEFAULT_SETTINGS.albumEnabled),
    albumName: str(s.albumName, DEFAULT_SETTINGS.albumName).trim() || DEFAULT_SETTINGS.albumName,
    cameraChecklist: bool(s.cameraChecklist, DEFAULT_SETTINGS.cameraChecklist),
    gridColumns: s.gridColumns === 3 ? 3 : 2,
  };
}

/** Returns a valid archive, or null if the data is not a simpleArchive file at all. */
export function migrate(data: unknown, now = new Date().toISOString().slice(0, 19)): Archive | null {
  if (!isObj(data) || data.app !== 'simpleArchive' || !Array.isArray(data.items)) return null;
  const items = data.items.map((v) => item(v, now)).filter((x): x is Item => !!x);
  const itemIds = new Set<string>();
  const uniqueItems = items.filter((it) => (itemIds.has(it.id) ? false : (itemIds.add(it.id), true)));
  const photoIds = new Set<string>();
  const photos = (Array.isArray(data.photos) ? data.photos : [])
    .map((v) => photo(v, now))
    .filter((p): p is Photo => !!p && itemIds.has(p.itemId) && (photoIds.has(p.id) ? false : (photoIds.add(p.id), true)));
  // Covers must point at a photo of the same item.
  const photoItem = new Map(photos.map((p) => [p.id, p.itemId]));
  for (const it of uniqueItems) if (it.coverId && photoItem.get(it.coverId) !== it.id) it.coverId = null;
  return {
    app: 'simpleArchive',
    version: 1,
    id: str(data.id) || newId(16),
    items: uniqueItems,
    photos,
    settings: settings(data.settings),
    createdAt: str(data.createdAt, now),
    updatedAt: str(data.updatedAt, now),
  };
}
