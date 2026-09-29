// Google Drive as a backup target (REST API v3, scope drive.file: the app only
// sees the files it created itself). The access token comes from the native
// Google sign-in; this module only speaks HTTP, so it is fully testable.
import { REMOTE_DIRS, RemoteError, type RemoteDir, type RemoteFile, type RemoteStore, type Transport } from './http';

export const DRIVE_API = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';

/** Returns an access token; `refresh` asks for a new one after a 401. */
export type TokenProvider = (refresh: boolean) => Promise<string>;

interface DriveFile {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
  mimeType?: string;
}

interface Req {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  bodyFile?: string;
  responseFile?: string;
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function describe(status: number, body: string): string {
  let reason = '';
  try {
    reason = JSON.parse(body)?.error?.message ?? '';
  } catch {
    /* not JSON */
  }
  if (status === 401) return 'Google-Anmeldung abgelaufen – bitte neu verbinden.';
  if (status === 403 && /storage|quota/i.test(reason)) return 'Google Drive ist voll.';
  if (status === 403) return `Google Drive verweigert den Zugriff${reason ? `: ${reason}` : ''}.`;
  if (status === 404) return 'Datei in Google Drive nicht gefunden.';
  if (status === 429) return 'Google Drive bremst gerade (zu viele Anfragen) – später noch mal.';
  if (status >= 500) return `Google Drive hat einen Serverfehler (${status}).`;
  return `Google Drive: unerwarteter Status ${status}${reason ? ` (${reason})` : ''}.`;
}

export class DriveStore implements RemoteStore {
  readonly label = 'Google Drive';
  private folderIds = new Map<RemoteDir, string>();
  /** name → file id per folder, filled by list(). */
  private fileIds = new Map<RemoteDir, Map<string, string>>();
  private token: string | null = null;

  constructor(
    /** Path of the backup folder in "Meine Ablage", e.g. "simpleArchive". */
    private folder: string,
    private getToken: TokenProvider,
    private transport: Transport,
  ) {}

  private async send(req: Req, ok: number[]) {
    for (let attempt = 0; ; attempt++) {
      if (!this.token || attempt > 0) this.token = await this.getToken(attempt > 0);
      let res;
      try {
        res = await this.transport({ ...req, headers: { Authorization: `Bearer ${this.token}`, ...(req.headers ?? {}) } });
      } catch (e) {
        throw new RemoteError(e instanceof Error ? e.message : 'Keine Verbindung zu Google Drive.');
      }
      if (res.status === 401 && attempt === 0) continue;
      if (!ok.includes(res.status)) throw new RemoteError(describe(res.status, res.body), res.status);
      return res;
    }
  }

  private async json<T>(req: Req, ok = [200]): Promise<T> {
    const res = await this.send(req, ok);
    try {
      return JSON.parse(res.body) as T;
    } catch {
      throw new RemoteError('Google Drive hat unlesbar geantwortet.');
    }
  }

  private async query(query: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q: query,
        fields: 'nextPageToken,files(id,name,size,modifiedTime,mimeType)',
        pageSize: '1000',
        spaces: 'drive',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.json<{ files?: DriveFile[]; nextPageToken?: string }>({ method: 'GET', url: `${DRIVE_API}/files?${params}` });
      out.push(...(page.files ?? []));
      pageToken = page.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  private async ensureFolder(name: string, parent: string): Promise<string> {
    const found = await this.query(`name = ${q(name)} and ${q(parent)} in parents and mimeType = '${FOLDER}' and trashed = false`);
    if (found.length) return found[0].id;
    const created = await this.json<{ id: string }>({
      method: 'POST',
      url: `${DRIVE_API}/files?fields=id`,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
    });
    return created.id;
  }

  async prepare(): Promise<void> {
    if (this.folderIds.size === REMOTE_DIRS.length + 1) return;
    let parent = 'root';
    for (const part of this.folder.split('/').map((s) => s.trim()).filter(Boolean)) parent = await this.ensureFolder(part, parent);
    this.folderIds.set('', parent);
    for (const dir of REMOTE_DIRS) this.folderIds.set(dir, await this.ensureFolder(dir, parent));
  }

  private async folderId(dir: RemoteDir): Promise<string> {
    if (!this.folderIds.has(dir)) await this.prepare();
    return this.folderIds.get(dir)!;
  }

  async list(dir: RemoteDir): Promise<RemoteFile[]> {
    const parent = await this.folderId(dir);
    const files = (await this.query(`${q(parent)} in parents and trashed = false`)).filter((f) => f.mimeType !== FOLDER);
    const ids = new Map<string, string>();
    for (const f of files) if (!ids.has(f.name)) ids.set(f.name, f.id);
    this.fileIds.set(dir, ids);
    return files.map((f) => ({ name: f.name, size: Number(f.size ?? 0) || 0, modified: f.modifiedTime ?? null }));
  }

  private async fileId(dir: RemoteDir, name: string): Promise<string | null> {
    const known = this.fileIds.get(dir);
    if (known?.has(name)) return known.get(name)!;
    const parent = await this.folderId(dir);
    const found = await this.query(`name = ${q(name)} and ${q(parent)} in parents and trashed = false`);
    if (!found.length) return null;
    if (!this.fileIds.has(dir)) this.fileIds.set(dir, new Map());
    this.fileIds.get(dir)!.set(name, found[0].id);
    return found[0].id;
  }

  /** Creates the file entry if needed, then uploads the content with a plain media upload. */
  private async upload(dir: RemoteDir, name: string, mime: string, content: { body?: string; bodyFile?: string }) {
    let id = await this.fileId(dir, name);
    if (!id) {
      const parent = await this.folderId(dir);
      id = (
        await this.json<{ id: string }>({
          method: 'POST',
          url: `${DRIVE_API}/files?fields=id`,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ name, mimeType: mime, parents: [parent] }),
        })
      ).id;
      if (!this.fileIds.has(dir)) this.fileIds.set(dir, new Map());
      this.fileIds.get(dir)!.set(name, id);
    }
    await this.send({ method: 'PATCH', url: `${DRIVE_UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=id`, headers: { 'Content-Type': mime }, ...content }, [200]);
  }

  putText(dir: RemoteDir, name: string, text: string): Promise<void> {
    return this.upload(dir, name, 'application/json', { body: text });
  }

  putFile(dir: RemoteDir, name: string, localFile: string): Promise<void> {
    return this.upload(dir, name, 'image/jpeg', { bodyFile: localFile });
  }

  async getText(dir: RemoteDir, name: string): Promise<string | null> {
    const id = await this.fileId(dir, name);
    if (!id) return null;
    return (await this.send({ method: 'GET', url: `${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media` }, [200])).body;
  }

  async getFile(dir: RemoteDir, name: string, localFile: string): Promise<void> {
    const id = await this.fileId(dir, name);
    if (!id) throw new RemoteError(`${name} fehlt in Google Drive.`, 404);
    await this.send({ method: 'GET', url: `${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`, responseFile: localFile }, [200]);
  }

  async remove(dir: RemoteDir, name: string): Promise<void> {
    const id = await this.fileId(dir, name);
    if (!id) return;
    await this.send({ method: 'DELETE', url: `${DRIVE_API}/files/${encodeURIComponent(id)}` }, [200, 204, 404]);
    this.fileIds.get(dir)?.delete(name);
  }

  /** Name and e-mail of the connected account, for the settings screen. */
  async account(): Promise<{ name: string; email: string }> {
    const about = await this.json<{ user?: { displayName?: string; emailAddress?: string } }>({ method: 'GET', url: `${DRIVE_API}/about?fields=user(displayName,emailAddress)` });
    return { name: about.user?.displayName ?? '', email: about.user?.emailAddress ?? '' };
  }
}
