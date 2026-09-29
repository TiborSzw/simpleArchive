import { describe, expect, it } from 'vitest';
import { addPhotos, createItem, emptyArchive, purgeOne, trashPhoto } from '../core/archive';
import { photosOf } from '../core/query';
import type { Archive } from '../core/types';
import { DriveStore } from './drive';
import { FakeDav, FakeDrive, FakeMedia } from './fakes';
import { RemoteError } from './http';
import { ForeignArchiveError, CancelledError, inspectRemote, listRestorePoints, readRestorePoint, restoreMedia, runBackup } from './sync';
import { DavStore, davRoot, folderUrl, parseMultistatus } from './webdav';

const NOW = '2026-09-29T20:00:00';
const DAV = { url: 'cloud.example.com', user: 'tibor', password: 'app-pass', folder: 'simpleArchive' };

function makeArchive(media: FakeMedia, photoCount = 3): { a: Archive; itemId: string } {
  let a = emptyArchive('2026-09-01T10:00:00');
  const c = createItem(a, { name: 'Captain Titus', status: 'wip', tags: ['Space Marines'] }, '2026-09-01T10:00:00');
  a = c.archive;
  const photos = Array.from({ length: photoCount }, (_, i) => {
    const file = `p_2026-09-0${i + 1}_abc${i}.jpg`;
    const thumb = `t_2026-09-0${i + 1}_abc${i}.jpg`;
    media.files.set(file, new Uint8Array([0xff, 0xd8, i, 1, 2, 3]));
    media.files.set(thumb, new Uint8Array([0xff, 0xd8, i]));
    return { file, thumb, width: 3000, height: 4000, bytes: 6, takenAt: `2026-09-0${i + 1}T12:00:00` };
  });
  a = addPhotos(a, c.item.id, photos, '2026-09-05T10:00:00').archive;
  return { a, itemId: c.item.id };
}

describe('webdav urls', () => {
  it('builds Nextcloud and plain WebDAV urls', () => {
    expect(davRoot({ url: 'cloud.example.com/', user: 'Tibor S' })).toBe('https://cloud.example.com/remote.php/dav/files/Tibor%20S/');
    expect(davRoot({ url: 'https://srv/webdav', user: 'x' })).toBe('https://srv/webdav/');
    expect(folderUrl({ ...DAV, folder: 'Backups/ Mini Archiv ' }, 'photos')).toBe('https://cloud.example.com/remote.php/dav/files/tibor/Backups/Mini%20Archiv/photos/');
  });

  it('parses multistatus responses and skips folders', () => {
    const xml = `<d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/dav/simpleArchive/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
      <d:response><d:href>/dav/simpleArchive/archive.json</d:href><d:propstat><d:prop><d:getcontentlength>42</d:getcontentlength><d:getlastmodified>Tue, 29 Sep 2026 10:00:00 GMT</d:getlastmodified><d:resourcetype/></d:prop></d:propstat></d:response>
      <D:response xmlns:D="DAV:"><D:href>/dav/simpleArchive/Gr%C3%BC%C3%9Fe.jpg</D:href><D:propstat><D:prop><D:getcontentlength>7</D:getcontentlength></D:prop></D:propstat></D:response>
    </d:multistatus>`;
    expect(parseMultistatus(xml)).toEqual([
      { name: 'archive.json', size: 42, modified: 'Tue, 29 Sep 2026 10:00:00 GMT' },
      { name: 'Grüße.jpg', size: 7, modified: null },
    ]);
  });
});

describe('backup to Nextcloud', () => {
  it('uploads photos, thumbnails, archive and a daily snapshot – then only what changed', async () => {
    const media = new FakeMedia();
    const server = new FakeDav(media);
    const store = new DavStore(DAV, server.transport);
    let { a, itemId } = makeArchive(media);

    const first = await runBackup(store, a, { now: NOW, keep: 30 });
    expect(first.uploaded).toBe(6);
    expect(first.uploadedBytes).toBe(18);
    expect(server.fileNames('simpleArchive/photos/')).toHaveLength(3);
    expect(server.fileNames('simpleArchive/thumbs/')).toHaveLength(3);
    expect(server.fileNames('simpleArchive/')).toEqual(['archive.json']);
    expect(server.fileNames('simpleArchive/history/')).toEqual(['archive-2026-09-29.json']);
    expect(JSON.parse(server.files.get('simpleArchive/archive.json') as string).id).toBe(a.id);
    // Binary content arrives untouched.
    expect(server.files.get(`simpleArchive/photos/${a.photos[0].file}`)).toEqual(media.files.get(a.photos[0].file));

    const again = await runBackup(store, a, { now: NOW, keep: 30 });
    expect(again.uploaded).toBe(0);

    media.files.set('p_new.jpg', new Uint8Array([1]));
    media.files.set('t_new.jpg', new Uint8Array([2]));
    a = addPhotos(a, itemId, [{ file: 'p_new.jpg', thumb: 't_new.jpg', width: 1, height: 1, bytes: 1, takenAt: NOW }], NOW).archive;
    const third = await runBackup(store, a, { now: NOW, keep: 30 });
    expect(third.uploaded).toBe(2);
  });

  it('keeps trashed photos in the backup and removes purged ones', async () => {
    const media = new FakeMedia();
    const server = new FakeDav(media);
    const store = new DavStore(DAV, server.transport);
    let { a, itemId } = makeArchive(media);
    await runBackup(store, a, { now: NOW, keep: 30 });

    const victim = photosOf(a, itemId)[0];
    a = trashPhoto(a, victim.id, NOW);
    let res = await runBackup(store, a, { now: NOW, keep: 30 });
    expect(res.removed).toBe(0);
    expect(server.fileNames('simpleArchive/photos/')).toContain(victim.file);

    a = purgeOne(a, 'photo', victim.id, NOW).archive;
    res = await runBackup(store, a, { now: NOW, keep: 30 });
    expect(res.removed).toBe(2);
    expect(server.fileNames('simpleArchive/photos/')).not.toContain(victim.file);
    expect(server.fileNames('simpleArchive/thumbs/')).toHaveLength(2);
  });

  it('never deletes files on the server that are not ours', async () => {
    const media = new FakeMedia();
    const server = new FakeDav(media);
    const store = new DavStore(DAV, server.transport);
    const { a } = makeArchive(media);
    await runBackup(store, a, { now: NOW, keep: 30 });
    server.files.set('simpleArchive/photos/Urlaub.png', 'x');
    await runBackup(store, a, { now: NOW, keep: 30 });
    expect(server.files.has('simpleArchive/photos/Urlaub.png')).toBe(true);
  });

  it('rotates daily snapshots', async () => {
    const media = new FakeMedia();
    const server = new FakeDav(media);
    const store = new DavStore(DAV, server.transport);
    const { a } = makeArchive(media);
    for (const day of ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29']) await runBackup(store, a, { now: `${day}T21:00:00`, keep: 2 });
    expect(server.fileNames('simpleArchive/history/')).toEqual(['archive-2026-09-28.json', 'archive-2026-09-29.json']);
  });

  it('refuses to overwrite the backup of a different archive', async () => {
    const media = new FakeMedia();
    const server = new FakeDav(media);
    const store = new DavStore(DAV, server.transport);
    const { a } = makeArchive(media);
    await runBackup(store, a, { now: NOW, keep: 30 });

    const fresh = emptyArchive(NOW); // e.g. a new phone before restoring
    await expect(runBackup(store, fresh, { now: NOW, keep: 30 })).rejects.toBeInstanceOf(ForeignArchiveError);
    expect(server.fileNames('simpleArchive/photos/')).toHaveLength(3);
    expect(await inspectRemote(store)).toMatchObject({ id: a.id, items: 1, photos: 3 });

    await runBackup(store, fresh, { now: NOW, keep: 30, force: true });
    expect(JSON.parse(server.files.get('simpleArchive/archive.json') as string).id).toBe(fresh.id);
    expect(server.fileNames('simpleArchive/photos/')).toHaveLength(0);
  });

  it('reports wrong credentials in plain German', async () => {
    const media = new FakeMedia();
    const server = new FakeDav(media);
    const store = new DavStore({ ...DAV, password: 'falsch' }, server.transport);
    await expect(inspectRemote(store)).rejects.toThrow(/App-Passwort/);
  });

  it('stops on errors and on cancel without writing archive.json', async () => {
    const media = new FakeMedia();
    const server = new FakeDav(media);
    const store = new DavStore(DAV, server.transport);
    const { a } = makeArchive(media);
    server.failPut = (p) => p.includes('/photos/');
    await expect(runBackup(store, a, { now: NOW, keep: 30 })).rejects.toThrow(/Speicherplatz/);
    expect(server.files.has('simpleArchive/archive.json')).toBe(false);

    server.failPut = null;
    let calls = 0;
    await expect(runBackup(store, a, { now: NOW, keep: 30, concurrency: 1, isCancelled: () => ++calls > 2 })).rejects.toBeInstanceOf(CancelledError);
    expect(server.files.has('simpleArchive/archive.json')).toBe(false);
  });
});

describe('restore from Nextcloud', () => {
  it('brings everything to a new phone', async () => {
    const oldPhone = new FakeMedia();
    const server = new FakeDav(oldPhone);
    const { a } = makeArchive(oldPhone);
    await runBackup(new DavStore(DAV, server.transport), a, { now: NOW, keep: 30 });

    const newPhone = new FakeMedia();
    server.media = newPhone;
    const store = new DavStore(DAV, server.transport);
    const points = await listRestorePoints(store);
    expect(points.map((p) => p.day)).toEqual([null, '2026-09-29']);
    const archive = await readRestorePoint(store, points[0]);
    expect(archive).toEqual(a);
    const progress: number[] = [];
    const res = await restoreMedia(store, archive, new Set(), { now: NOW, onProgress: (p) => p.phase === 'download' && progress.push(p.done) });
    expect(res.downloaded).toBe(6);
    expect(res.missing).toBe(0);
    expect(res.archive).toEqual(a);
    expect(progress.at(-1)).toBe(6);
    for (const p of a.photos) expect(newPhone.files.get(p.file)).toEqual(oldPhone.files.get(p.file));
    // A second restore on the same phone has nothing left to download.
    expect((await restoreMedia(store, archive, new Set(newPhone.files.keys()), { now: NOW })).downloaded).toBe(0);
  });

  it('falls back to thumbnails and drops photos without any image', async () => {
    const oldPhone = new FakeMedia();
    const server = new FakeDav(oldPhone);
    const { a } = makeArchive(oldPhone);
    const store = new DavStore(DAV, server.transport);
    await runBackup(store, a, { now: NOW, keep: 30 });
    const [p0, p1] = a.photos;
    server.files.delete(`simpleArchive/photos/${p0.file}`);
    server.files.delete(`simpleArchive/photos/${p1.file}`);
    server.files.delete(`simpleArchive/thumbs/${p1.thumb}`);
    const archive = { ...a, items: a.items.map((it) => ({ ...it, coverId: p1.id })) };
    server.media = new FakeMedia();
    const res = await restoreMedia(store, archive, new Set(), { now: NOW });
    expect(res.missing).toBe(1);
    expect(res.archive.photos).toHaveLength(2);
    expect(res.archive.photos.find((p) => p.id === p0.id)!.file).toBe(p0.thumb);
    expect(res.archive.items[0].coverId).toBeNull();
  });

  it('rejects files that are not archives', async () => {
    const media = new FakeMedia();
    const server = new FakeDav(media);
    const store = new DavStore(DAV, server.transport);
    await store.prepare();
    server.files.set('simpleArchive/archive.json', '{"app":"simpleLife"}');
    await expect(readRestorePoint(store, { dir: '', name: 'archive.json' })).rejects.toThrow(/kein simpleArchive-Backup/);
    server.files.set('simpleArchive/archive.json', 'kaputt');
    await expect(readRestorePoint(store, { dir: '', name: 'archive.json' })).rejects.toThrow(/beschädigt/);
  });
});

describe('Google Drive', () => {
  function drive(media: FakeMedia) {
    const server = new FakeDrive(media);
    const tokens: boolean[] = [];
    const getToken = async (refresh: boolean) => {
      tokens.push(refresh);
      return refresh ? server.validToken : 'expired-token';
    };
    return { server, tokens, store: new DriveStore('simpleArchive', getToken, server.transport) };
  }

  it('backs up incrementally, refreshing an expired token once', async () => {
    const media = new FakeMedia();
    const { server, tokens, store } = drive(media);
    let { a, itemId } = makeArchive(media);
    const res = await runBackup(store, a, { now: NOW, keep: 30 });
    expect(res.uploaded).toBe(6);
    expect(tokens).toEqual([false, true]);
    expect(server.namesIn('simpleArchive/photos')).toHaveLength(3);
    expect(server.namesIn('simpleArchive')).toEqual(['archive.json']);
    expect(server.namesIn('simpleArchive/history')).toEqual(['archive-2026-09-29.json']);
    expect(server.contentOf(`simpleArchive/photos/${a.photos[1].file}`)).toEqual(media.files.get(a.photos[1].file));

    // Second run: nothing to upload, archive.json is updated in place (no duplicates).
    a = { ...a, updatedAt: '2026-09-29T21:00:00' };
    expect((await runBackup(store, a, { now: NOW, keep: 30 })).uploaded).toBe(0);
    expect(server.namesIn('simpleArchive')).toEqual(['archive.json']);
    expect(JSON.parse(server.contentOf('simpleArchive/archive.json') as string).updatedAt).toBe('2026-09-29T21:00:00');

    // A fresh client (new session) finds the existing folders instead of creating new ones.
    const again = new DriveStore('simpleArchive', async () => server.validToken, server.transport);
    a = purgeOne(a, 'photo', photosOf(a, itemId)[0].id, NOW).archive;
    const r = await runBackup(again, a, { now: NOW, keep: 30 });
    expect(r.removed).toBe(2);
    expect([...server.files.values()].filter((f) => f.name === 'simpleArchive')).toHaveLength(1);
    expect(server.namesIn('simpleArchive/photos')).toHaveLength(2);
  });

  it('restores onto a new phone and reads the account', async () => {
    const oldPhone = new FakeMedia();
    const { server, store } = drive(oldPhone);
    const { a } = makeArchive(oldPhone);
    await runBackup(store, a, { now: NOW, keep: 30 });

    const newPhone = new FakeMedia();
    server.media = newPhone;
    const fresh = new DriveStore('simpleArchive', async () => server.validToken, server.transport);
    const points = await listRestorePoints(fresh);
    const archive = await readRestorePoint(fresh, points[0]);
    const res = await restoreMedia(fresh, archive, new Set(), { now: NOW });
    expect(res.downloaded).toBe(6);
    expect(newPhone.files.size).toBe(6);
    expect(await fresh.account()).toEqual({ name: 'Tibor', email: 'tibor@example.com' });
  });

  it('surfaces a permanent auth failure', async () => {
    const media = new FakeMedia();
    const server = new FakeDrive(media);
    const store = new DriveStore('simpleArchive', async () => 'nope', server.transport);
    const err = await inspectRemote(store).catch((e) => e);
    expect(err).toBeInstanceOf(RemoteError);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/neu verbinden/);
  });
});
