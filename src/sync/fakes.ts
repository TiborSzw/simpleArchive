// In-memory fake servers for tests: a WebDAV server that behaves like
// Nextcloud and a small subset of the Google Drive REST API.
import type { HttpRequest, HttpResponse, Transport } from './http';

export type Blobish = string | Uint8Array;

/** Local media files of the fake "device". */
export class FakeMedia {
  files = new Map<string, Blobish>();
  read(name: string): Blobish {
    const f = this.files.get(name);
    if (f === undefined) throw new Error(`local file missing: ${name}`);
    return f;
  }
}

const size = (b: Blobish) => (typeof b === 'string' ? new TextEncoder().encode(b).length : b.length);
const text = (b: Blobish) => (typeof b === 'string' ? b : new TextDecoder().decode(b));

function bodyOf(req: HttpRequest, media: FakeMedia): Blobish {
  if (req.bodyFile !== undefined) return media.read(req.bodyFile);
  return req.body ?? '';
}

function respond(req: HttpRequest, media: FakeMedia, status: number, body: Blobish = '', headers: Record<string, string> = {}): HttpResponse {
  if (req.responseFile !== undefined && status >= 200 && status < 300) {
    media.files.set(req.responseFile, body);
    return { status, body: '', headers };
  }
  return { status, body: text(body), headers };
}

// ---------------------------------------------------------------------------
// WebDAV (Nextcloud)
// ---------------------------------------------------------------------------

export class FakeDav {
  /** Paths relative to the DAV root, folders end with '/'. */
  dirs = new Set<string>(['']);
  files = new Map<string, Blobish>();
  requests: HttpRequest[] = [];
  root = 'https://cloud.example.com/remote.php/dav/files/tibor/';
  auth = `Basic ${btoa('tibor:app-pass')}`;
  failPut: ((path: string) => boolean) | null = null;

  constructor(public media: FakeMedia) {}

  transport: Transport = async (req) => {
    this.requests.push(req);
    if (req.headers.Authorization !== this.auth) return { status: 401, body: '', headers: {} };
    if (!req.url.startsWith(this.root)) return { status: 404, body: '', headers: {} };
    const path = decodeURIComponent(req.url.slice(this.root.length));
    const parent = (p: string) => p.replace(/[^/]*\/?$/, '');
    switch (req.method) {
      case 'MKCOL': {
        const dir = path.endsWith('/') ? path : `${path}/`;
        if (this.dirs.has(dir)) return { status: 405, body: '', headers: {} };
        if (!this.dirs.has(parent(dir))) return { status: 409, body: '', headers: {} };
        this.dirs.add(dir);
        return { status: 201, body: '', headers: {} };
      }
      case 'PUT': {
        if (!this.dirs.has(parent(path))) return { status: 409, body: '', headers: {} };
        if (this.failPut?.(path)) return { status: 507, body: '', headers: {} };
        const existed = this.files.has(path);
        this.files.set(path, bodyOf(req, this.media));
        return { status: existed ? 204 : 201, body: '', headers: {} };
      }
      case 'GET': {
        const f = this.files.get(path);
        return f === undefined ? { status: 404, body: '', headers: {} } : respond(req, this.media, 200, f);
      }
      case 'DELETE': {
        const existed = this.files.delete(path);
        return { status: existed ? 204 : 404, body: '', headers: {} };
      }
      case 'PROPFIND': {
        const dir = path.endsWith('/') || path === '' ? path : `${path}/`;
        if (!this.dirs.has(dir)) return { status: 404, body: '', headers: {} };
        const base = new URL(this.root).pathname;
        const entries: string[] = [`<d:response><d:href>${base}${encodeURI(dir)}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>`];
        for (const d of this.dirs)
          if (d !== dir && parent(d) === dir)
            entries.push(`<d:response><d:href>${base}${encodeURI(d)}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>`);
        for (const [p, content] of this.files)
          if (parent(p) === dir)
            entries.push(
              `<d:response><d:href>${base}${p.split('/').map(encodeURIComponent).join('/')}</d:href><d:propstat><d:prop><d:getcontentlength>${size(content)}</d:getcontentlength><d:getlastmodified>Tue, 29 Sep 2026 10:00:00 GMT</d:getlastmodified><d:resourcetype/></d:prop></d:propstat></d:response>`,
            );
        return { status: 207, body: `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${entries.join('')}</d:multistatus>`, headers: {} };
      }
      default:
        return { status: 405, body: '', headers: {} };
    }
  };

  fileNames(dir: string): string[] {
    return [...this.files.keys()].filter((p) => p.startsWith(dir) && !p.slice(dir.length).includes('/')).map((p) => p.slice(dir.length)).sort();
  }
}

// ---------------------------------------------------------------------------
// Google Drive
// ---------------------------------------------------------------------------

interface DFile {
  id: string;
  name: string;
  parents: string[];
  mimeType: string;
  content: Blobish;
  trashed: boolean;
}

export class FakeDrive {
  files = new Map<string, DFile>();
  requests: HttpRequest[] = [];
  validToken = 'token-1';
  pageSize = 2;
  private nextId = 1;

  constructor(public media: FakeMedia) {}

  transport: Transport = async (req) => {
    this.requests.push(req);
    if (req.headers.Authorization !== `Bearer ${this.validToken}`) return { status: 401, body: '{"error":{"message":"Invalid Credentials"}}', headers: {} };
    const url = new URL(req.url);
    const json = (status: number, data: unknown) => ({ status, body: JSON.stringify(data), headers: { 'content-type': 'application/json' } });

    if (url.pathname === '/drive/v3/about') return json(200, { user: { displayName: 'Tibor', emailAddress: 'tibor@example.com' } });

    if (url.pathname === '/drive/v3/files' && req.method === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const name = /name = '((?:\\'|[^'])*)'/.exec(q)?.[1]?.replace(/\\'/g, "'");
      const parent = /'([^']*)' in parents/.exec(q)?.[1];
      const mime = /mimeType = '([^']*)'/.exec(q)?.[1];
      const all = [...this.files.values()].filter(
        (f) => !f.trashed && (name === undefined || f.name === name) && (parent === undefined || f.parents.includes(parent)) && (mime === undefined || f.mimeType === mime),
      );
      const start = Number(url.searchParams.get('pageToken') ?? 0);
      const page = all.slice(start, start + this.pageSize);
      const more = start + this.pageSize < all.length;
      return json(200, {
        files: page.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: String(size(f.content)), modifiedTime: '2026-09-29T10:00:00.000Z' })),
        ...(more ? { nextPageToken: String(start + this.pageSize) } : {}),
      });
    }

    if (url.pathname === '/drive/v3/files' && req.method === 'POST') {
      const meta = JSON.parse(req.body ?? '{}');
      const id = `id${this.nextId++}`;
      this.files.set(id, { id, name: meta.name, parents: meta.parents ?? ['root'], mimeType: meta.mimeType ?? 'application/octet-stream', content: '', trashed: false });
      return json(200, { id });
    }

    const upload = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (upload && req.method === 'PATCH') {
      const f = this.files.get(decodeURIComponent(upload[1]));
      if (!f) return json(404, { error: { message: 'File not found' } });
      f.content = bodyOf(req, this.media);
      return json(200, { id: f.id });
    }

    const single = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (single) {
      const f = this.files.get(decodeURIComponent(single[1]));
      if (!f) return json(404, { error: { message: 'File not found' } });
      if (req.method === 'DELETE') {
        this.files.delete(f.id);
        return { status: 204, body: '', headers: {} };
      }
      if (req.method === 'GET' && url.searchParams.get('alt') === 'media') return respond(req, this.media, 200, f.content);
    }
    return json(400, { error: { message: `unsupported ${req.method} ${url.pathname}` } });
  };

  /** Names of the files in the folder with the given path ("simpleArchive/photos"). */
  namesIn(path: string): string[] {
    let parent = 'root';
    for (const part of path.split('/')) {
      const folder = [...this.files.values()].find((f) => f.name === part && f.parents.includes(parent) && f.mimeType === 'application/vnd.google-apps.folder');
      if (!folder) return [];
      parent = folder.id;
    }
    return [...this.files.values()].filter((f) => f.parents.includes(parent) && f.mimeType !== 'application/vnd.google-apps.folder').map((f) => f.name).sort();
  }

  contentOf(path: string): Blobish | undefined {
    const parts = path.split('/');
    const name = parts.pop()!;
    let parent = 'root';
    for (const part of parts) {
      const folder = [...this.files.values()].find((f) => f.name === part && f.parents.includes(parent));
      if (!folder) return undefined;
      parent = folder.id;
    }
    return [...this.files.values()].find((f) => f.name === name && f.parents.includes(parent))?.content;
  }
}
