// Collection statistics: Pile of Shame, painted per month, streaks, fun facts.
import { KINDS } from './constants';
import { daysBetween, lastMonths, monthOf } from './dates';
import { liveItems, tagIndex, type TagCount } from './query';
import type { Archive, Item, Kind, Status } from './types';

export interface StatusCount {
  items: number;
  models: number;
}

export interface MonthCount {
  month: string;
  items: number;
  models: number;
}

export interface CollectionStats {
  items: number;
  models: number;
  photos: number;
  photoBytes: number;
  favorites: number;
  byStatus: Record<Status, StatusCount>;
  byKind: { kind: Kind; items: number; models: number }[];
  /** Unpainted + primed models. */
  shameModels: number;
  /** Share of painted (finished) models, 0..1. */
  paintedShare: number;
  perMonth: MonthCount[];
  thisYear: StatusCount;
  /** Consecutive months with at least one finished work, up to this month (or last month). */
  monthStreak: number;
  /** Average days from "in Arbeit" to "fertig". */
  avgDaysToFinish: number | null;
  oldestShame: { item: Item; days: number } | null;
  topTags: TagCount[];
}

export function collectionStats(a: Archive, now: string, months = 12): CollectionStats {
  const items = liveItems(a);
  const alive = new Set(items.map((it) => it.id));
  const photos = a.photos.filter((p) => !p.deletedAt && alive.has(p.itemId));

  const byStatus: Record<Status, StatusCount> = {
    unpainted: { items: 0, models: 0 },
    primed: { items: 0, models: 0 },
    wip: { items: 0, models: 0 },
    done: { items: 0, models: 0 },
  };
  const kindMap = new Map<Kind, { items: number; models: number }>();
  let models = 0;
  for (const it of items) {
    byStatus[it.status].items++;
    byStatus[it.status].models += it.models;
    models += it.models;
    const k = kindMap.get(it.kind) ?? { items: 0, models: 0 };
    k.items++;
    k.models += it.models;
    kindMap.set(it.kind, k);
  }

  const monthKeys = lastMonths(now, months);
  const perMonthMap = new Map(monthKeys.map((m) => [m, { month: m, items: 0, models: 0 }]));
  const finishedMonths = new Set<string>();
  const year = now.slice(0, 4);
  const thisYear = { items: 0, models: 0 };
  let durationSum = 0;
  let durationCount = 0;
  for (const it of items) {
    if (it.status !== 'done' || !it.finishedAt) continue;
    const m = monthOf(it.finishedAt);
    finishedMonths.add(m);
    const entry = perMonthMap.get(m);
    if (entry) {
      entry.items++;
      entry.models += it.models;
    }
    if (it.finishedAt.startsWith(year)) {
      thisYear.items++;
      thisYear.models += it.models;
    }
    if (it.startedAt) {
      const d = daysBetween(it.startedAt, it.finishedAt);
      if (d >= 0) {
        durationSum += d;
        durationCount++;
      }
    }
  }

  // Streak: the current month may still be empty without breaking the streak.
  const streakMonths = lastMonths(now, 240).reverse();
  let monthStreak = 0;
  for (let i = 0; i < streakMonths.length; i++) {
    if (finishedMonths.has(streakMonths[i])) monthStreak++;
    else if (i === 0) continue;
    else break;
  }

  let oldestShame: CollectionStats['oldestShame'] = null;
  for (const it of items) {
    if (it.status !== 'unpainted' && it.status !== 'primed') continue;
    if (!oldestShame || it.createdAt < oldestShame.item.createdAt) oldestShame = { item: it, days: daysBetween(it.createdAt, now) };
  }

  const shameModels = byStatus.unpainted.models + byStatus.primed.models;
  return {
    items: items.length,
    models,
    photos: photos.length,
    photoBytes: photos.reduce((s, p) => s + p.bytes, 0),
    favorites: items.filter((it) => it.favorite).length,
    byStatus,
    byKind: KINDS.filter((k) => kindMap.has(k)).map((k) => ({ kind: k, ...kindMap.get(k)! })),
    shameModels,
    paintedShare: models ? byStatus.done.models / models : 0,
    perMonth: monthKeys.map((m) => perMonthMap.get(m)!),
    thisYear,
    monthStreak,
    avgDaysToFinish: durationCount ? Math.round(durationSum / durationCount) : null,
    oldestShame,
    topTags: tagIndex(a).slice(0, 8),
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${(n / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
}
