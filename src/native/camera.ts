// Getting images in: camera, photo picker (multi-select) and the native
// crop/rotate editor. In the browser a plain file input does the job.
import { Camera, MediaTypeSelection, type MediaResult } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { mediaPath } from './media';
import { isNative } from './platform';

export interface PickedImage {
  blob: Blob;
  /** Capture date reported by the system (ISO), if any – EXIF is read separately. */
  createdAt: string | null;
  /** Original file name, if known (browser only). */
  name?: string;
}

const CANCEL_CODES = ['OS-PLUG-CAMR-0006', 'OS-PLUG-CAMR-0013', 'OS-PLUG-CAMR-0020'];

export function isCancel(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  return !!err && (CANCEL_CODES.includes(err.code ?? '') || /cancel/i.test(err.message ?? ''));
}

async function toPicked(r: MediaResult): Promise<PickedImage> {
  const src = r.webPath ?? (r.uri ? Capacitor.convertFileSrc(r.uri) : null);
  if (!src) throw new Error('Das Foto konnte nicht gelesen werden.');
  const res = await fetch(src);
  if (!res.ok) throw new Error('Das Foto konnte nicht gelesen werden.');
  return { blob: await res.blob(), createdAt: r.metadata?.creationDate ?? null };
}

// ---------------------------------------------------------------------------
// Browser file input
// ---------------------------------------------------------------------------

function pickFiles(multiple: boolean, capture: boolean): Promise<PickedImage[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    let done = false;
    const finish = (files: PickedImage[]) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])].map((f) => ({ blob: f as Blob, createdAt: f.lastModified ? new Date(f.lastModified).toISOString() : null, name: f.name }));
      finish(files);
    });
    input.addEventListener('cancel', () => finish([]));
    document.body.appendChild(input);
    input.click();
  });
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Opens the camera. Returns null when cancelled. */
export async function takePhoto(): Promise<PickedImage | null> {
  if (!isNative) return (await pickFiles(false, true))[0] ?? null;
  try {
    const r = await Camera.takePhoto({ quality: 95, correctOrientation: true, saveToGallery: false, includeMetadata: true });
    return await toPicked(r);
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
}

/** Opens the photo picker (multi-select). Returns [] when cancelled. */
export async function pickPhotos(): Promise<PickedImage[]> {
  if (!isNative) return pickFiles(true, false);
  try {
    const { results } = await Camera.chooseFromGallery({ mediaType: MediaTypeSelection.Photo, allowMultipleSelection: true, limit: 0, includeMetadata: true, correctOrientation: true });
    const out: PickedImage[] = [];
    for (const r of results) out.push(await toPicked(r));
    return out;
  } catch (e) {
    if (isCancel(e)) return [];
    throw e;
  }
}

export const canEditPhotos = isNative;

/** Opens the native editor (crop, rotate …) on a stored photo. Returns null when cancelled. */
export async function editPhoto(file: string): Promise<PickedImage | null> {
  if (!isNative) return null;
  try {
    const r = await Camera.editURIPhoto({ uri: mediaPath(file), saveToGallery: false, includeMetadata: false });
    return await toPicked(r);
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
}
