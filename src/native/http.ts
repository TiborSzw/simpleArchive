// Transport for the backup engine: native OkHttp on Android (no CORS, files are
// streamed from and to disk), fetch + IndexedDB in the browser.
import { registerPlugin } from '@capacitor/core';
import { lowerHeaders, type HttpRequest, type HttpResponse, type Transport } from '../sync/http';
import { markPresent, mediaPath, readMedia, writeMedia } from './media';
import { isNative } from './platform';

interface NativeHttpPlugin {
  request(req: { method: string; url: string; headers: Record<string, string>; body?: string; bodyPath?: string; responsePath?: string }): Promise<{ status: number; body: string; headers: Record<string, string> }>;
}

const NativeHttp = registerPlugin<NativeHttpPlugin>('NativeHttp');

const nativeTransport: Transport = async (req: HttpRequest): Promise<HttpResponse> => {
  const res = await NativeHttp.request({
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
    bodyPath: req.bodyFile !== undefined ? mediaPath(req.bodyFile) : undefined,
    responsePath: req.responseFile !== undefined ? mediaPath(req.responseFile) : undefined,
  });
  if (req.responseFile !== undefined && res.status >= 200 && res.status < 300) markPresent(req.responseFile);
  return { status: res.status, body: res.body ?? '', headers: lowerHeaders(res.headers) };
};

/** Browser fallback – only works with servers that allow CORS (Google Drive does, most Nextclouds don't). */
const fetchTransport: Transport = async (req) => {
  const body = req.bodyFile !== undefined ? await readMedia(req.bodyFile) : req.body;
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  if (req.responseFile !== undefined && res.ok) {
    await writeMedia(req.responseFile, await res.blob());
    return { status: res.status, body: '', headers };
  }
  return { status: res.status, body: await res.text(), headers };
};

export const transport: Transport = isNative ? nativeTransport : fetchTransport;
