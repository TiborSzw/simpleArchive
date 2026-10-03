// Links from the other simple* apps (pure part, see src/ui/links.ts).
import { KINDS, STATUSES } from './constants';
import type { Kind, Status } from './types';

export interface ItemLink {
  ref: string;
  name: string;
  kind: Kind;
  models: number;
  status: Status;
  tags: string[];
  photo: boolean;
}

/** Parses a simplearchive:// link; null if it is not one of ours. */
export function parseLink(url: string): ItemLink | null {
  const m = /^simplearchive:\/\/werk\?(.*)$/i.exec(url.trim());
  if (!m) return null;
  const q = new URLSearchParams(m[1]);
  const ref = (q.get('ref') ?? '').trim();
  const name = (q.get('name') ?? '').trim().slice(0, 80);
  if (!ref || !name) return null;
  const kind = KINDS.includes(q.get('kind') as Kind) ? (q.get('kind') as Kind) : 'unit';
  const status = STATUSES.includes(q.get('status') as Status) ? (q.get('status') as Status) : 'unpainted';
  const models = Math.max(1, Math.min(999, Math.round(Number(q.get('models')) || 1)));
  const tags = (q.get('tags') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
  return { ref, name, kind, models, status, tags, photo: q.get('photo') === '1' };
}

/** "simplearmy:termagants" → "termagants" (only refs that simpleArmy understands). */
export const armyUnit = (ref: string | undefined) => (ref && /^simplearmy:[a-z0-9-]+$/.test(ref) ? ref.slice('simplearmy:'.length) : null);
