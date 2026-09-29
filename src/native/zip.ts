// Whole archive as a ZIP via the system "save as" dialog (Google Drive, USB,
// Downloads …) and back. Native only.
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { Archive } from '../core/types';
import { mediaPath } from './media';
import { isNative } from './platform';

interface ZipProgress {
  phase: 'export' | 'import';
  done: number;
  total: number;
}

interface ArchiveZipPlugin {
  exportZip(opts: { fileName: string; json: string; entries: { path: string; name: string }[] }): Promise<{ uri: string; bytes: number; files: number }>;
  importZip(): Promise<{ json: string; extracted: number; skipped: number }>;
  addListener(event: 'progress', fn: (p: ZipProgress) => void): Promise<PluginListenerHandle>;
}

const ArchiveZip = registerPlugin<ArchiveZipPlugin>('ArchiveZip');

export const zipSupported = isNative;

export function isZipCancel(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'CANCELLED';
}

async function withProgress<T>(onProgress: ((p: ZipProgress) => void) | undefined, run: () => Promise<T>): Promise<T> {
  const handle = onProgress ? await ArchiveZip.addListener('progress', onProgress) : null;
  try {
    return await run();
  } finally {
    await handle?.remove();
  }
}

export async function exportZip(archive: Archive, fileName: string, onProgress?: (p: ZipProgress) => void) {
  const entries: { path: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const p of archive.photos) {
    for (const [dir, name] of [
      ['photos', p.file],
      ['thumbs', p.thumb],
    ] as const) {
      const key = `${dir}/${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ path: mediaPath(name), name: key });
    }
  }
  return withProgress(onProgress, () => ArchiveZip.exportZip({ fileName, json: JSON.stringify(archive), entries }));
}

export async function importZip(onProgress?: (p: ZipProgress) => void) {
  return withProgress(onProgress, () => ArchiveZip.importZip());
}
