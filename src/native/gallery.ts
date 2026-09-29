// Copies of the archive photos in their own album of the phone gallery.
import { registerPlugin } from '@capacitor/core';
import { parseLocal } from '../core/dates';
import { cacheWrite, mediaPath } from './media';
import { isNative } from './platform';

interface GalleryPlugin {
  saveToAlbum(opts: { path: string; album: string; fileName: string; takenAt?: number }): Promise<{ uri: string }>;
}

const Gallery = registerPlugin<GalleryPlugin>('Gallery');

export const albumSupported = isNative;

/** Friendly album file name: "Captain Titus 2026-09-29 1432.jpg" */
export function albumFileName(title: string, takenAt: string, id: string): string {
  const clean = title.replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'simpleArchive';
  return `${clean} ${takenAt.slice(0, 10)} ${takenAt.slice(11, 16).replace(':', '')} ${id.slice(0, 4)}.jpg`;
}

export async function saveToAlbum(file: string, album: string, fileName: string, takenAt: string): Promise<void> {
  if (!isNative) return;
  const ms = parseLocal(takenAt).getTime();
  await Gallery.saveToAlbum({ path: mediaPath(file), album, fileName, takenAt: Number.isFinite(ms) ? ms : undefined });
}

/** Saves a rendered image (e.g. a showcase card) into the album. */
export async function saveBlobToAlbum(blob: Blob, album: string, fileName: string): Promise<void> {
  if (!isNative) return;
  const uri = await cacheWrite(fileName, blob);
  await Gallery.saveToAlbum({ path: uri, album, fileName, takenAt: Date.now() });
}
