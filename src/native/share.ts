// Android share sheet: photos, showcase cards.
import { Share } from '@capacitor/share';
import { cacheCopy, cacheWrite, readMedia } from './media';
import { isNative } from './platform';

export function safeFileName(title: string, ext = 'jpg'): string {
  const base = title.replace(/[\\/:*?"<>|#%\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'simpleArchive';
  return `${base}.${ext}`;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function webShare(files: File[], title: string, text?: string): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files })) {
    try {
      await nav.share({ files, title, text });
    } catch {
      /* cancelled */
    }
    return true;
  }
  return false;
}

/** Shares stored photos under friendly names. */
export async function sharePhotos(photos: { file: string; name: string }[], title: string, text?: string): Promise<void> {
  if (isNative) {
    const used = new Set<string>();
    const uris: string[] = [];
    for (const p of photos) {
      let name = safeFileName(p.name);
      for (let i = 2; used.has(name); i++) name = safeFileName(`${p.name} ${i}`);
      used.add(name);
      uris.push(await cacheCopy(p.file, name));
    }
    await Share.share({ title, text, files: uris, dialogTitle: 'Teilen' });
    return;
  }
  const files = await Promise.all(photos.map(async (p) => new File([await readMedia(p.file)], safeFileName(p.name), { type: 'image/jpeg' })));
  if (!(await webShare(files, title, text))) files.forEach((f) => downloadBlob(f, f.name));
}

/** Shares a freshly rendered image (e.g. a showcase card). */
export async function shareBlob(blob: Blob, name: string, title: string, text?: string): Promise<void> {
  const fileName = safeFileName(name);
  if (isNative) {
    const uri = await cacheWrite(fileName, blob);
    await Share.share({ title, text, files: [uri], dialogTitle: 'Teilen' });
    return;
  }
  const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  if (!(await webShare([file], title, text))) downloadBlob(blob, fileName);
}

export function isShareCancel(e: unknown): boolean {
  return /cancel/i.test((e as { message?: string } | null)?.message ?? '');
}
