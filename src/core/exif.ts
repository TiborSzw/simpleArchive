// Minimal EXIF reader: finds the capture date of a JPEG, nothing else.
// Photos imported from the gallery keep their real date in the timeline.

const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;

/** Returns "YYYY-MM-DDTHH:MM:SS" (local, as stored by the camera) or null. */
export function readExifDate(buf: ArrayBuffer | Uint8Array): string | null {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 <= view.byteLength) {
    if (view.getUint8(off) !== 0xff) return null;
    const marker = view.getUint8(off + 1);
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan: no EXIF before the image data
    const len = view.getUint16(off + 2);
    if (marker === 0xe1 && off + 10 <= view.byteLength && ascii(view, off + 4, 4) === 'Exif') {
      try {
        return parseTiff(view, off + 10, Math.min(view.byteLength, off + 2 + len));
      } catch {
        return null;
      }
    }
    off += 2 + len;
  }
  return null;
}

function ascii(view: DataView, start: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && start + i < view.byteLength; i++) {
    const c = view.getUint8(start + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function parseTiff(view: DataView, tiff: number, end: number): string | null {
  const order = view.getUint16(tiff);
  const le = order === 0x4949;
  if (!le && order !== 0x4d4d) return null;
  const u16 = (o: number) => view.getUint16(o, le);
  const u32 = (o: number) => view.getUint32(o, le);
  if (u16(tiff + 2) !== 42) return null;

  const readIfd = (ifdOffset: number): Map<number, number> => {
    const entries = new Map<number, number>();
    const start = tiff + ifdOffset;
    if (start + 2 > end) return entries;
    const count = u16(start);
    for (let i = 0; i < count; i++) {
      const e = start + 2 + i * 12;
      if (e + 12 > end) break;
      entries.set(u16(e), e);
    }
    return entries;
  };

  const readDate = (entry: number | undefined): string | null => {
    if (entry === undefined) return null;
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    if (type !== 2 || count < 19) return null;
    const valueOffset = tiff + u32(entry + 8);
    if (valueOffset + 19 > end) return null;
    return exifDateToIso(ascii(view, valueOffset, 19));
  };

  const ifd0 = readIfd(u32(tiff + 4));
  const exifPtr = ifd0.get(TAG_EXIF_IFD);
  if (exifPtr !== undefined) {
    const exif = readIfd(u32(exifPtr + 8));
    const original = readDate(exif.get(TAG_DATETIME_ORIGINAL));
    if (original) return original;
  }
  return readDate(ifd0.get(TAG_DATETIME));
}

/** "2026:09:29 14:32:10" → "2026-09-29T14:32:10" */
export function exifDateToIso(s: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m || m[1] === '0000' || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}
