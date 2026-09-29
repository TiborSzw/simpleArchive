// Nextcloud (or any WebDAV server) as a backup target.
import { REMOTE_DIRS, RemoteError, type RemoteDir, type RemoteFile, type RemoteStore, type Transport } from './http';

export interface DavConfig {
  /** Nextcloud address (https://cloud.example.com) or a full WebDAV folder URL. */
  url: string;
  user: string;
  /** App password. */
  password: string;
  /** Folder inside the WebDAV root, e.g. "simpleArchive" or "Backups/simpleArchive". */
  folder: string;
}

const encodePath = (path: string) =>
  path
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(encodeURIComponent);

/** WebDAV root of the account, always with a trailing slash. */
export function davRoot(cfg: Pick<DavConfig, 'url' | 'user'>): string {
  let url = cfg.url.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, '');
  if (/\/remote\.php\//.test(url) || /\/dav(\/|$)/.test(url) || /\/webdav(\/|$)/i.test(url)) return `${url}/`;
  return `${url}/remote.php/dav/files/${encodeURIComponent(cfg.user.trim())}/`;
}

export function folderUrl(cfg: DavConfig, dir: RemoteDir = ''): string {
  const parts = [...encodePath(cfg.folder), ...encodePath(dir)];
  return davRoot(cfg) + (parts.length ? `${parts.join('/')}/` : '');
}

function authHeader(cfg: DavConfig): string {
  const bytes = new TextEncoder().encode(`${cfg.user.trim()}:${cfg.password}`);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `Basic ${btoa(bin)}`;
}

function describe(status: number): string {
  if (status === 401) return 'Anmeldung fehlgeschlagen – Benutzername oder App-Passwort stimmt nicht.';
  if (status === 403) return 'Zugriff verweigert (403).';
  if (status === 404) return 'Adresse nicht gefunden (404) – stimmt die Server-Adresse?';
  if (status === 409) return 'Übergeordneter Ordner fehlt (409).';
  if (status === 413) return 'Datei zu groß für den Server (413).';
  if (status === 423) return 'Datei ist auf dem Server gesperrt (423) – gleich noch mal versuchen.';
  if (status === 507) return 'Kein Speicherplatz mehr in der Nextcloud (507).';
  if (status >= 500) return `Serverfehler (${status}).`;
  return `Unerwarteter Status ${status}.`;
}

export class DavStore implements RemoteStore {
  readonly label = 'Nextcloud';

  constructor(
    private cfg: DavConfig,
    private transport: Transport,
  ) {}

  private async send(req: { method: string; url: string; headers?: Record<string, string>; body?: string; bodyFile?: string; responseFile?: string }) {
    try {
      return await this.transport({ ...req, headers: { Authorization: authHeader(this.cfg), ...(req.headers ?? {}) } });
    } catch (e) {
      throw new RemoteError(e instanceof Error ? e.message : 'Keine Verbindung zum Server.');
    }
  }

  private check(status: number, ok: number[]) {
    if (!ok.includes(status)) throw new RemoteError(describe(status), status);
  }

  private fileUrl(dir: RemoteDir, name: string) {
    return folderUrl(this.cfg, dir) + encodeURIComponent(name);
  }

  async prepare(): Promise<void> {
    let url = davRoot(this.cfg);
    for (const part of encodePath(this.cfg.folder)) {
      url += `${part}/`;
      await this.mkcol(url);
    }
    for (const dir of REMOTE_DIRS) await this.mkcol(folderUrl(this.cfg, dir));
  }

  private async mkcol(url: string) {
    const res = await this.send({ method: 'MKCOL', url });
    // 201 created, 405 already exists (Nextcloud/SabreDAV), 301 some servers redirect existing folders
    this.check(res.status, [201, 405, 301]);
  }

  async list(dir: RemoteDir): Promise<RemoteFile[]> {
    const body =
      '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getlastmodified/><d:resourcetype/></d:prop></d:propfind>';
    const res = await this.send({ method: 'PROPFIND', url: folderUrl(this.cfg, dir), headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }, body });
    if (res.status === 404) return [];
    this.check(res.status, [207]);
    return parseMultistatus(res.body);
  }

  async putText(dir: RemoteDir, name: string, text: string): Promise<void> {
    const res = await this.send({ method: 'PUT', url: this.fileUrl(dir, name), headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: text });
    this.check(res.status, [200, 201, 204]);
  }

  async putFile(dir: RemoteDir, name: string, localFile: string): Promise<void> {
    const res = await this.send({ method: 'PUT', url: this.fileUrl(dir, name), headers: { 'Content-Type': 'image/jpeg' }, bodyFile: localFile });
    this.check(res.status, [200, 201, 204]);
  }

  async getText(dir: RemoteDir, name: string): Promise<string | null> {
    const res = await this.send({ method: 'GET', url: this.fileUrl(dir, name) });
    if (res.status === 404) return null;
    this.check(res.status, [200]);
    return res.body;
  }

  async getFile(dir: RemoteDir, name: string, localFile: string): Promise<void> {
    const res = await this.send({ method: 'GET', url: this.fileUrl(dir, name), responseFile: localFile });
    this.check(res.status, [200]);
  }

  async remove(dir: RemoteDir, name: string): Promise<void> {
    const res = await this.send({ method: 'DELETE', url: this.fileUrl(dir, name) });
    this.check(res.status, [200, 204, 404]);
  }
}

const tag = (name: string) => new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i');

/** Parses a PROPFIND multistatus response into files (folders are skipped). */
export function parseMultistatus(xml: string): RemoteFile[] {
  const files: RemoteFile[] = [];
  const responses = xml.match(/<(?:[\w-]+:)?response\b[\s\S]*?<\/(?:[\w-]+:)?response>/gi) ?? [];
  for (const r of responses) {
    if (/<(?:[\w-]+:)?collection\b/i.test(r)) continue;
    const href = tag('href').exec(r)?.[1]?.trim();
    if (!href) continue;
    let name: string;
    try {
      name = decodeURIComponent(href.replace(/\/+$/, '').split('/').pop() ?? '');
    } catch {
      continue;
    }
    if (!name) continue;
    const size = Number(tag('getcontentlength').exec(r)?.[1] ?? 0) || 0;
    const modified = tag('getlastmodified').exec(r)?.[1]?.trim() ?? null;
    files.push({ name, size, modified });
  }
  return files;
}
