// The HTTP layer is injected so the same backup code runs natively on Android
// (OkHttp plugin, no CORS, streams files from disk), in the browser (fetch)
// and in tests (an in-memory fake server).

export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Text body. */
  body?: string;
  /** Send the bytes of this local media file as the body (streamed natively). */
  bodyFile?: string;
  /** Write the response body into this local media file instead of returning it. */
  responseFile?: string;
}

export interface HttpResponse {
  status: number;
  /** Empty when `responseFile` was used. */
  body: string;
  /** Lower-case header names. */
  headers: Record<string, string>;
}

export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

export class RemoteError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

export interface RemoteFile {
  name: string;
  size: number;
  modified: string | null;
}

/** Sub-folders of the backup folder. '' is the backup folder itself. */
export type RemoteDir = '' | 'photos' | 'thumbs' | 'history';

export const REMOTE_DIRS: RemoteDir[] = ['photos', 'thumbs', 'history'];

/** What the sync engine needs from a backup target (Nextcloud, Google Drive, …). */
export interface RemoteStore {
  readonly label: string;
  /** Creates the backup folder and its sub-folders if needed. */
  prepare(): Promise<void>;
  list(dir: RemoteDir): Promise<RemoteFile[]>;
  putText(dir: RemoteDir, name: string, text: string): Promise<void>;
  putFile(dir: RemoteDir, name: string, localFile: string): Promise<void>;
  /** null when the file does not exist. */
  getText(dir: RemoteDir, name: string): Promise<string | null>;
  getFile(dir: RemoteDir, name: string, localFile: string): Promise<void>;
  remove(dir: RemoteDir, name: string): Promise<void>;
}

export function lowerHeaders(h: Record<string, string> | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h ?? {})) out[k.toLowerCase()] = String(v);
  return out;
}
