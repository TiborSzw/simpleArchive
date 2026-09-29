// Navigation: four tabs plus a stack of full-screen pages and sheets on top.
// The Android back button (and Escape) pops the stack.
import type { NewPhoto, Status } from '../core/types';
import { minimizeApp } from '../native/platform';
import { createStore } from './store';

export type Tab = 'gallery' | 'collection' | 'school' | 'settings';

export type Screen =
  | { type: 'item'; id: string }
  | { type: 'viewer'; photoIds: string[]; index: number }
  | { type: 'editor'; itemId: string | null; photos?: NewPhoto[]; status?: Status }
  | { type: 'compare'; itemId: string }
  | { type: 'showcase'; itemId: string; photoId?: string; beforeId?: string }
  | { type: 'lesson'; id: string }
  | { type: 'trash' }
  | { type: 'tags' }
  | { type: 'about' };

export type SheetKind = { type: 'add'; itemId: string | null } | { type: 'target'; photos: NewPhoto[] } | { type: 'checklist'; then: () => void };

export interface NavState {
  tab: Tab;
  stack: Screen[];
  sheet: SheetKind | null;
}

export const nav = createStore<NavState>({ tab: 'gallery', stack: [], sheet: null });

const closeHandlers: (() => boolean)[] = [];

/** Lets a component intercept "back" (e.g. to leave zoom mode first). Returns an unregister function. */
export function interceptBack(fn: () => boolean): () => void {
  closeHandlers.push(fn);
  return () => {
    const i = closeHandlers.lastIndexOf(fn);
    if (i >= 0) closeHandlers.splice(i, 1);
  };
}

export const setTab = (tab: Tab) => nav.set((s) => ({ ...s, tab, stack: [], sheet: null }));
export const push = (screen: Screen) => nav.set((s) => ({ ...s, stack: [...s.stack, screen], sheet: null }));
export const replaceTop = (screen: Screen) => nav.set((s) => ({ ...s, stack: [...s.stack.slice(0, -1), screen], sheet: null }));
export const pop = () => nav.set((s) => ({ ...s, stack: s.stack.slice(0, -1) }));
export const openSheet = (sheet: SheetKind) => nav.set((s) => ({ ...s, sheet }));
export const closeSheet = () => nav.set((s) => ({ ...s, sheet: null }));

/** Removes every screen that shows a deleted item. */
export function dropScreensFor(itemId: string) {
  nav.set((s) => ({ ...s, stack: s.stack.filter((sc) => !('itemId' in sc && sc.itemId === itemId) && !(sc.type === 'item' && sc.id === itemId)) }));
}

export function goBack(): boolean {
  for (let i = closeHandlers.length - 1; i >= 0; i--) if (closeHandlers[i]()) return true;
  const s = nav.get();
  if (s.sheet) {
    closeSheet();
    return true;
  }
  if (s.stack.length) {
    pop();
    return true;
  }
  if (s.tab !== 'gallery') {
    setTab('gallery');
    return true;
  }
  return false;
}

export function handleBackButton() {
  if (!goBack()) minimizeApp();
}
