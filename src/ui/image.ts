// Image pipeline: decode (EXIF orientation applied), scale down to the chosen
// size, re-encode as JPEG and build a thumbnail. Re-encoding also strips all
// metadata – shared photos never leak the GPS position of your hobby room.
import { toLocalIso } from '../core/dates';
import { readExifDate } from '../core/exif';

export const THUMB_EDGE = 640;

export interface ProcessedImage {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** Local ISO date-time: EXIF, else the date the system reported, else now. */
  takenAt: string;
}

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to <img> (e.g. HEIC the WebView cannot decode as bitmap) */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('Dieses Bildformat kann nicht gelesen werden.');
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

const sizeOf = (src: ImageBitmap | HTMLImageElement) =>
  src instanceof HTMLImageElement ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height };

function fit(w: number, h: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Scales in halving steps – noticeably sharper thumbnails than one big jump. */
function scaleDown(src: CanvasImageSource, sw: number, sh: number, tw: number, th: number): HTMLCanvasElement {
  let cur: CanvasImageSource = src;
  let cw = sw;
  let ch = sh;
  while (cw / 2 >= tw && ch / 2 >= th) {
    const next = canvas(Math.round(cw / 2), Math.round(ch / 2));
    const ctx = next.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, next.width, next.height);
    cur = next;
    cw = next.width;
    ch = next.height;
  }
  const out = canvas(tw, th);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, tw, th);
  return out;
}

export function toJpeg(c: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht gespeichert werden (zu wenig Speicher?).'))), 'image/jpeg', quality));
}

export async function processImage(blob: Blob, maxEdge: number, createdAt: string | null): Promise<ProcessedImage> {
  let takenAt: string | null = null;
  try {
    takenAt = readExifDate(new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer()));
  } catch {
    /* no EXIF */
  }
  if (!takenAt && createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) takenAt = toLocalIso(d);
  }

  const src = await decode(blob);
  try {
    const { w: sw, h: sh } = sizeOf(src);
    if (!sw || !sh) throw new Error('Leeres Bild.');
    const { w, h } = fit(sw, sh, maxEdge);
    const full = scaleDown(src, sw, sh, w, h);
    const t = fit(w, h, THUMB_EDGE);
    const thumb = scaleDown(full, w, h, t.w, t.h);
    const [fullBlob, thumbBlob] = await Promise.all([toJpeg(full, 0.92), toJpeg(thumb, 0.82)]);
    // Free the big canvas right away – phones are picky about memory.
    full.width = full.height = 0;
    return { full: fullBlob, thumb: thumbBlob, width: w, height: h, takenAt: takenAt ?? toLocalIso(new Date()) };
  } finally {
    if ('close' in src) src.close();
  }
}

/** Loads an image element from a URL (for canvas work). */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    img.src = url;
  });
}
