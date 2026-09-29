// Google sign-in for the Drive backup (native only). Tokens live in memory;
// Play services keeps the grant, so a silent authorize() gets a fresh token.
import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';

interface GoogleAuthPlugin {
  authorize(opts: { interactive: boolean }): Promise<{ accessToken: string; email?: string }>;
  clearToken(opts: { token: string }): Promise<void>;
  revoke(opts: { email: string }): Promise<void>;
}

const GoogleAuth = registerPlugin<GoogleAuthPlugin>('GoogleAuth');

export const driveSupported = isNative;

let token: string | null = null;

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

function wrap(e: unknown): GoogleAuthError {
  const err = e as { message?: string; code?: string };
  return new GoogleAuthError(err?.message ?? 'Google-Anmeldung fehlgeschlagen.', err?.code ?? 'UNKNOWN');
}

/** Interactive sign-in (shows Google's consent screen the first time). */
export async function connectGoogle(): Promise<{ email: string | null }> {
  try {
    const r = await GoogleAuth.authorize({ interactive: true });
    token = r.accessToken;
    return { email: r.email ?? null };
  } catch (e) {
    throw wrap(e);
  }
}

/** Token provider for DriveStore: `refresh` drops the cached token first (after a 401). */
export async function driveToken(refresh: boolean): Promise<string> {
  if (token && !refresh) return token;
  if (token && refresh) await GoogleAuth.clearToken({ token }).catch(() => undefined);
  token = null;
  try {
    token = (await GoogleAuth.authorize({ interactive: false })).accessToken;
    return token;
  } catch (e) {
    const err = wrap(e);
    if (err.code === 'NEEDS_CONSENT') throw new GoogleAuthError('Google Drive ist nicht mehr verbunden – bitte in den Einstellungen neu verbinden.', err.code);
    throw err;
  }
}

export async function disconnectGoogle(email: string | null): Promise<void> {
  if (token) await GoogleAuth.clearToken({ token }).catch(() => undefined);
  token = null;
  if (email) await GoogleAuth.revoke({ email }).catch(() => undefined);
}
