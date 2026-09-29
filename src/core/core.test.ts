import { describe, expect, it } from 'vitest';
import {
  addPhotos,
  createItem,
  deleteTag,
  emptyArchive,
  markInAlbum,
  movePhoto,
  purgeOne,
  purgeTrash,
  referencedFiles,
  renameTag,
  restorePhoto,
  setCover,
  toggleFavorite,
  trashItem,
  trashPhoto,
  updateItem,
} from './archive';
import { dateLabel, lastMonths, monthLabel, relativeLabel } from './dates';
import { exifDateToIso, readExifDate } from './exif';
import { migrate } from './migrate';
import { EMPTY_FILTER, coverOf, filterItems, groupByMonth, livePhotos, photosOf, tagIndex, trashEntries } from './query';
import { collectionStats, formatBytes } from './stats';
import { mergeTags, normalizeTag, parseHashtags } from './tags';
import type { Archive, NewPhoto } from './types';

const T0 = '2026-09-01T10:00:00';
const T1 = '2026-09-10T12:00:00';
const T2 = '2026-09-20T18:30:00';

const pic = (n: number, takenAt = T0): NewPhoto => ({ file: `p_${n}.jpg`, thumb: `t_${n}.jpg`, width: 3000, height: 4000, bytes: 1000 * n, takenAt });

function sample(): { a: Archive; captain: string; orks: string; tower: string } {
  let a = emptyArchive(T0);
  const c = createItem(a, { name: 'Captain Titus', kind: 'mini', status: 'wip', tags: ['Warhammer 40k', 'Space Marines', 'NMM'] }, T0);
  a = c.archive;
  const o = createItem(a, { name: 'Boyz', kind: 'unit', status: 'unpainted', tags: ['warhammer 40K', 'Orks'], models: 10 }, T0);
  a = o.archive;
  const t = createItem(a, { name: 'Wachturm', kind: 'terrain', status: 'done', tags: ['Gebäude'], favorite: true }, T1);
  a = t.archive;
  a = addPhotos(a, c.item.id, [pic(1, T0), pic(2, T1)], T1).archive;
  a = addPhotos(a, t.item.id, [pic(3, T2)], T2).archive;
  return { a, captain: c.item.id, orks: o.item.id, tower: t.item.id };
}

describe('tags', () => {
  it('normalizes and merges case-insensitively', () => {
    expect(normalizeTag('  #Space   Marines ')).toBe('Space Marines');
    expect(normalizeTag('a,b')).toBe('ab');
    expect(mergeTags(['Orks'], ['orks', 'NMM', '#nmm', ''])).toEqual(['Orks', 'NMM']);
    expect(mergeTags([], ['warhammer 40k'], ['Warhammer 40k'])).toEqual(['Warhammer 40k']);
  });

  it('parses hashtags out of a title', () => {
    expect(parseHashtags('Captain Titus #Space_Marines #nmm')).toEqual({ text: 'Captain Titus', tags: ['Space Marines', 'nmm'] });
    expect(parseHashtags('Kein Tag hier')).toEqual({ text: 'Kein Tag hier', tags: [] });
    expect(parseHashtags('#Orks Boyz')).toEqual({ text: 'Boyz', tags: ['Orks'] });
  });
});

describe('archive', () => {
  it('creates items with status side effects and canonical tags', () => {
    const { a, captain, orks, tower } = sample();
    const c = a.items.find((it) => it.id === captain)!;
    expect(c.startedAt).toBe(T0);
    expect(c.finishedAt).toBeNull();
    const o = a.items.find((it) => it.id === orks)!;
    expect(o.tags).toEqual(['Warhammer 40k', 'Orks']); // spelling of the first use
    expect(o.models).toBe(10);
    expect(a.items.find((it) => it.id === tower)!.finishedAt).toBe(T1);
  });

  it('sets finishedAt when done and clears it when reopened', () => {
    let { a, captain } = sample();
    a = updateItem(a, captain, { status: 'done' }, T2);
    expect(a.items.find((it) => it.id === captain)!.finishedAt).toBe(T2);
    a = updateItem(a, captain, { finishedAt: '2026-09-15T00:00:00' }, T2);
    expect(a.items.find((it) => it.id === captain)!.finishedAt).toBe('2026-09-15T00:00:00');
    a = updateItem(a, captain, { status: 'wip' }, T2);
    const c = a.items.find((it) => it.id === captain)!;
    expect(c.finishedAt).toBeNull();
    expect(c.startedAt).toBe(T0);
    expect(a.updatedAt).toBe(T2);
  });

  it('treats undefined patch values as unchanged', () => {
    let { a, tower } = sample();
    a = updateItem(a, tower, { name: 'Großer Wachturm', finishedAt: undefined, notes: undefined }, T2);
    const t = a.items.find((it) => it.id === tower)!;
    expect(t.finishedAt).toBe(T1);
    expect(t.notes).toBe('');
    expect(t.name).toBe('Großer Wachturm');
  });

  it('records the stage of photos and picks covers', () => {
    let { a, captain } = sample();
    const photos = photosOf(a, captain);
    expect(photos.map((p) => p.file)).toEqual(['p_1.jpg', 'p_2.jpg']);
    expect(photos.every((p) => p.stage === 'wip')).toBe(true);
    expect(coverOf(a, a.items.find((it) => it.id === captain)!)!.file).toBe('p_2.jpg'); // newest
    a = setCover(a, captain, photos[0].id, T2);
    expect(coverOf(a, a.items.find((it) => it.id === captain)!)!.file).toBe('p_1.jpg');
    a = trashPhoto(a, photos[0].id, T2);
    expect(a.items.find((it) => it.id === captain)!.coverId).toBeNull();
    expect(coverOf(a, a.items.find((it) => it.id === captain)!)!.file).toBe('p_2.jpg');
  });

  it('moves photos between items', () => {
    let { a, captain, tower } = sample();
    const p = photosOf(a, captain)[1];
    a = setCover(a, captain, p.id, T2);
    a = movePhoto(a, p.id, tower, T2);
    expect(photosOf(a, captain)).toHaveLength(1);
    expect(photosOf(a, tower)).toHaveLength(2);
    expect(a.items.find((it) => it.id === captain)!.coverId).toBeNull();
  });

  it('toggles favorites', () => {
    let { a, captain } = sample();
    a = toggleFavorite(a, captain, T2);
    expect(a.items.find((it) => it.id === captain)!.favorite).toBe(true);
    a = toggleFavorite(a, captain, T2);
    expect(a.items.find((it) => it.id === captain)!.favorite).toBe(false);
  });

  it('marks album copies without touching updatedAt', () => {
    const { a, captain } = sample();
    const ids = photosOf(a, captain).map((p) => p.id);
    const b = markInAlbum(a, ids);
    expect(photosOf(b, captain).every((p) => p.inAlbum)).toBe(true);
    expect(b.updatedAt).toBe(a.updatedAt);
  });

  it('keeps trashed things for 30 days, then purges them with their files', () => {
    let { a, captain, tower } = sample();
    a = trashItem(a, captain, '2026-09-21T09:00:00');
    const towerPhoto = photosOf(a, tower)[0];
    a = trashPhoto(a, towerPhoto.id, '2026-09-25T09:00:00');
    expect(livePhotos(a)).toHaveLength(0);
    expect(trashEntries(a).map((e) => e.kind)).toEqual(['photo', 'item']);

    const early = purgeTrash(a, '2026-10-10T09:00:00');
    expect(early.files).toEqual([]);
    expect(early.archive).toBe(a);

    const late = purgeTrash(a, '2026-10-21T09:00:00');
    expect(late.files.sort()).toEqual(['p_1.jpg', 'p_2.jpg', 't_1.jpg', 't_2.jpg']);
    expect(late.archive.items.some((it) => it.id === captain)).toBe(false);
    expect(late.archive.photos.some((p) => p.id === towerPhoto.id)).toBe(true); // only 26 days old

    const all = purgeTrash(a, '2026-09-26T00:00:00', true);
    expect(all.files).toHaveLength(6);
    expect(referencedFiles(all.archive).size).toBe(0);
  });

  it('restores a photo together with its trashed item', () => {
    let { a, captain } = sample();
    const p = photosOf(a, captain)[0];
    a = trashPhoto(a, p.id, T2);
    a = trashItem(a, captain, T2);
    a = restorePhoto(a, p.id, T2);
    expect(a.items.find((it) => it.id === captain)!.deletedAt).toBeNull();
    expect(photosOf(a, captain)).toHaveLength(2);
  });

  it('purges single entries', () => {
    const { a, captain } = sample();
    const res = purgeOne(a, 'item', captain, T2);
    expect(res.files.sort()).toEqual(['p_1.jpg', 'p_2.jpg', 't_1.jpg', 't_2.jpg']);
    expect(res.archive.photos).toHaveLength(1);
  });

  it('renames, merges and deletes tags', () => {
    let { a, captain, orks } = sample();
    a = renameTag(a, 'warhammer 40K', 'WH40k', T2);
    expect(a.items.find((it) => it.id === captain)!.tags).toEqual(['WH40k', 'Space Marines', 'NMM']);
    a = renameTag(a, 'Orks', 'wh40k', T2); // merge into existing tag
    expect(a.items.find((it) => it.id === orks)!.tags).toEqual(['WH40k']);
    a = deleteTag(a, 'wh40k', T2);
    expect(tagIndex(a).map((t) => t.tag)).toEqual(['Gebäude', 'NMM', 'Space Marines']);
  });
});

describe('query', () => {
  it('filters by text, tags, status, kind and favorites', () => {
    const { a } = sample();
    const names = (f: Partial<typeof EMPTY_FILTER>) => filterItems(a, { ...EMPTY_FILTER, ...f }).map((it) => it.name);
    expect(names({ q: 'titus' })).toEqual(['Captain Titus']);
    expect(names({ q: 'wachturm gebaude' })).toEqual(['Wachturm']); // umlauts folded
    expect(names({ tags: ['WARHAMMER 40k'], sort: 'name' })).toEqual(['Boyz', 'Captain Titus']);
    expect(names({ statuses: ['unpainted', 'primed'] })).toEqual(['Boyz']);
    expect(names({ kinds: ['terrain'] })).toEqual(['Wachturm']);
    expect(names({ favorites: true })).toEqual(['Wachturm']);
  });

  it('sorts by recent activity, finish date and name', () => {
    const { a } = sample();
    expect(filterItems(a, { ...EMPTY_FILTER, sort: 'recent' }).map((it) => it.name)).toEqual(['Wachturm', 'Captain Titus', 'Boyz']);
    expect(filterItems(a, { ...EMPTY_FILTER, sort: 'finished' })[0].name).toBe('Wachturm');
    expect(filterItems(a, { ...EMPTY_FILTER, sort: 'name' }).map((it) => it.name)).toEqual(['Boyz', 'Captain Titus', 'Wachturm']);
  });

  it('searches photo captions', () => {
    let { a } = sample();
    const p = livePhotos(a)[0];
    a = { ...a, photos: a.photos.map((x) => (x.id === p.id ? { ...x, caption: 'Abendlicht am Fenster' } : x)) };
    expect(filterItems(a, { ...EMPTY_FILTER, q: 'abendlicht' }).map((it) => it.name)).toEqual(['Wachturm']);
  });

  it('builds the tag index and month groups', () => {
    const { a } = sample();
    expect(tagIndex(a)[0]).toEqual({ tag: 'Warhammer 40k', count: 2 });
    const groups = groupByMonth(livePhotos(a));
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((p) => p.file)).toEqual(['p_3.jpg', 'p_2.jpg', 'p_1.jpg']);
  });
});

describe('stats', () => {
  it('counts the pile of shame, months and streaks', () => {
    let { a, captain } = sample();
    a = updateItem(a, captain, { status: 'done' }, '2026-08-15T10:00:00');
    const s = collectionStats(a, '2026-09-29T12:00:00');
    expect(s.items).toBe(3);
    expect(s.models).toBe(12);
    expect(s.shameModels).toBe(10);
    expect(s.byStatus.done).toEqual({ items: 2, models: 2 });
    expect(s.paintedShare).toBeCloseTo(2 / 12);
    expect(s.perMonth).toHaveLength(12);
    expect(s.perMonth.at(-1)).toEqual({ month: '2026-09', items: 1, models: 1 });
    expect(s.perMonth.at(-2)).toEqual({ month: '2026-08', items: 1, models: 1 });
    expect(s.monthStreak).toBe(2);
    expect(s.thisYear.items).toBe(2);
    expect(s.oldestShame?.item.name).toBe('Boyz');
    expect(s.oldestShame?.days).toBe(28);
    expect(s.photos).toBe(3);
    expect(s.photoBytes).toBe(6000);
    expect(s.byKind.map((k) => k.kind)).toEqual(['mini', 'unit', 'terrain']);
  });

  it('keeps the streak alive while the current month is still empty', () => {
    let { a, captain } = sample();
    a = updateItem(a, captain, { status: 'done' }, '2026-08-15T10:00:00');
    const s = collectionStats(a, '2026-10-02T12:00:00');
    expect(s.monthStreak).toBe(2);
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536 * 1024)).toBe('1,5 MB');
  });
});

describe('dates', () => {
  it('labels months and relative times in German', () => {
    expect(monthLabel('2026-03')).toBe('März 2026');
    expect(monthLabel('2027-01')).toBe('Jänner 2027'); // österreichisch
    expect(dateLabel('2026-09-29T14:00:00')).toBe('29. September 2026');
    expect(relativeLabel('2026-09-29T08:00:00', '2026-09-29T20:00:00')).toBe('heute');
    expect(relativeLabel('2026-09-28T23:00:00', '2026-09-29T01:00:00')).toBe('gestern');
    expect(relativeLabel('2024-09-01T00:00:00', '2026-09-29T00:00:00')).toBe('vor 2 Jahren');
    expect(lastMonths('2026-02-10T00:00:00', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

// ---------------------------------------------------------------------------
// EXIF
// ---------------------------------------------------------------------------

function jpegWithExif(date: string, littleEndian: boolean, original = true): Uint8Array {
  // TIFF: header(8) + IFD0 (1 entry) + ExifIFD (1 entry) + date string
  const tiff = new DataView(new ArrayBuffer(8 + 2 + 12 + 4 + 2 + 12 + 4 + 20));
  const le = littleEndian;
  tiff.setUint16(0, le ? 0x4949 : 0x4d4d);
  tiff.setUint16(2, 42, le);
  tiff.setUint32(4, 8, le);
  // IFD0 at 8: one entry
  tiff.setUint16(8, 1, le);
  const exifIfd = 8 + 2 + 12 + 4;
  const dateOffset = exifIfd + 2 + 12 + 4;
  if (original) {
    tiff.setUint16(10, 0x8769, le);
    tiff.setUint16(12, 4, le);
    tiff.setUint32(14, 1, le);
    tiff.setUint32(18, exifIfd, le);
    tiff.setUint16(exifIfd, 1, le);
    tiff.setUint16(exifIfd + 2, 0x9003, le);
  } else {
    tiff.setUint16(10, 0x0132, le);
    tiff.setUint16(12, 2, le);
    tiff.setUint32(14, 20, le);
    tiff.setUint32(18, dateOffset, le);
  }
  if (original) {
    tiff.setUint16(exifIfd + 4, 2, le);
    tiff.setUint32(exifIfd + 6, 20, le);
    tiff.setUint32(exifIfd + 10, dateOffset, le);
  }
  for (let i = 0; i < date.length; i++) tiff.setUint8(dateOffset + i, date.charCodeAt(i));
  const payload = new Uint8Array(6 + tiff.byteLength);
  payload.set([0x45, 0x78, 0x69, 0x66, 0, 0]);
  payload.set(new Uint8Array(tiff.buffer), 6);
  const out = new Uint8Array(2 + 4 + payload.length + 2);
  out.set([0xff, 0xd8, 0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  out.set(payload, 6);
  out.set([0xff, 0xd9], 6 + payload.length);
  return out;
}

describe('exif', () => {
  it('reads DateTimeOriginal in both byte orders', () => {
    expect(readExifDate(jpegWithExif('2025:12:24 18:05:09', true))).toBe('2025-12-24T18:05:09');
    expect(readExifDate(jpegWithExif('2025:12:24 18:05:09', false))).toBe('2025-12-24T18:05:09');
  });

  it('falls back to DateTime in IFD0', () => {
    expect(readExifDate(jpegWithExif('2024:01:02 03:04:05', true, false))).toBe('2024-01-02T03:04:05');
  });

  it('rejects garbage', () => {
    expect(readExifDate(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readExifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(readExifDate(jpegWithExif('0000:00:00 00:00:00', true))).toBeNull();
    expect(exifDateToIso('2026:13:01 00:00:00')).toBeNull();
  });
});

describe('migrate', () => {
  it('accepts its own output and repairs broken data', () => {
    const { a } = sample();
    expect(migrate(JSON.parse(JSON.stringify(a)))).toEqual(a);
    const broken = {
      app: 'simpleArchive',
      items: [{ id: 'x', name: 'Test', status: 'done', kind: 'spaceship', tags: ['ok', 3, ''], coverId: 'nope' }, { id: 'x' }, 'junk'],
      photos: [{ id: 'p', itemId: 'x', file: 'a.jpg' }, { id: 'q', itemId: 'missing', file: 'b.jpg' }],
      settings: { theme: 'neon', maxEdge: 99999, gridColumns: 5 },
    };
    const m = migrate(broken, T0)!;
    expect(m.items).toHaveLength(1);
    expect(m.items[0]).toMatchObject({ kind: 'other', tags: ['ok'], coverId: null, finishedAt: T0, models: 1 });
    expect(m.photos).toHaveLength(1);
    expect(m.photos[0]).toMatchObject({ thumb: 'a.jpg', takenAt: T0, stage: 'done' });
    expect(m.settings).toMatchObject({ theme: 'auto', maxEdge: 8192, gridColumns: 2 });
  });

  it('rejects foreign files', () => {
    expect(migrate({ hello: 'world' })).toBeNull();
    expect(migrate(null)).toBeNull();
    expect(migrate({ app: 'simpleLife', items: [] })).toBeNull();
  });
});
