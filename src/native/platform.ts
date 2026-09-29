// Everything that differs between the Android app and the browser, except
// media files (media.ts) and the camera (camera.ts).
import { App as CapApp } from '@capacitor/app';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Network } from '@capacitor/network';
import { Preferences } from '@capacitor/preferences';

export const isNative = Capacitor.isNativePlatform();

// ---------------------------------------------------------------------------
// Small key-value storage (settings, credentials, backup status):
// SharedPreferences on Android, localStorage in the browser.
// ---------------------------------------------------------------------------

export async function kvGet(key: string): Promise<string | null> {
  if (isNative) {
    try {
      return (await Preferences.get({ key })).value;
    } catch {
      return null;
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function kvSet(key: string, value: string | null): void {
  if (isNative) {
    void (value === null ? Preferences.remove({ key }) : Preferences.set({ key, value })).catch(() => undefined);
    return;
  }
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------------------
// System integration
// ---------------------------------------------------------------------------

export function setSystemBarsLight(lightBackground: boolean) {
  if (!isNative) return;
  void SystemBars.setStyle({ style: lightBackground ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => undefined);
}

export type HapticKind = 'tap' | 'success' | 'warn';

export function haptic(kind: HapticKind) {
  if (isNative) {
    const run =
      kind === 'tap'
        ? Haptics.impact({ style: ImpactStyle.Light })
        : kind === 'success'
          ? Haptics.notification({ type: NotificationType.Success })
          : Haptics.notification({ type: NotificationType.Warning });
    void run.catch(() => undefined);
    return;
  }
  try {
    navigator.vibrate?.(kind === 'tap' ? 8 : kind === 'success' ? [20, 40, 30] : [40, 30, 40]);
  } catch {
    /* ignore */
  }
}

export function onBackButton(handler: () => void) {
  if (!isNative) return;
  void CapApp.addListener('backButton', handler);
}

export function onAppPause(handler: () => void) {
  if (isNative) {
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) handler();
    });
    return;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') handler();
  });
}

export function onAppResume(handler: () => void) {
  if (isNative) {
    void CapApp.addListener('resume', handler);
    return;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') handler();
  });
}

export function minimizeApp() {
  if (isNative) void CapApp.minimizeApp().catch(() => undefined);
}

export type Connection = 'wifi' | 'cellular' | 'none' | 'unknown';

export async function connection(): Promise<Connection> {
  try {
    const s = await Network.getStatus();
    if (!s.connected) return 'none';
    return s.connectionType === 'wifi' || s.connectionType === 'cellular' ? s.connectionType : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function onConnectionChange(handler: (c: Connection) => void) {
  void Network.addListener('networkStatusChange', (s) => {
    handler(!s.connected ? 'none' : s.connectionType === 'wifi' || s.connectionType === 'cellular' ? s.connectionType : 'unknown');
  }).catch(() => undefined);
}
