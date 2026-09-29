// The archive: "Werke" (a mini, a unit, a piece of terrain …) with their photos.
// Everything here is plain JSON so it can be saved, backed up and diffed easily.

export type Kind = 'mini' | 'unit' | 'monster' | 'vehicle' | 'terrain' | 'diorama' | 'bust' | 'other';

/** Painting progress. `unpainted` + `primed` together form the Pile of Shame. */
export type Status = 'unpainted' | 'primed' | 'wip' | 'done';

export interface Item {
  id: string;
  name: string;
  kind: Kind;
  status: Status;
  /** Free tags (system, faction, technique …). Compared case-insensitively. */
  tags: string[];
  favorite: boolean;
  /** Recipe, paints, notes. */
  notes: string;
  /** Number of models (a squad of 10 counts as 10 for the Pile of Shame). */
  models: number;
  /** Explicit cover photo; otherwise the newest photo is used. */
  coverId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set automatically when the item first goes "in Arbeit". */
  startedAt: string | null;
  /** Set automatically when the item is marked "fertig" (editable). */
  finishedAt: string | null;
  /** In the trash since … (null = alive). */
  deletedAt: string | null;
}

export interface Photo {
  id: string;
  itemId: string;
  /** File name of the full image in the media store (e.g. "p_2026-09-29_ab12cd34.jpg"). */
  file: string;
  /** File name of the thumbnail in the media store. */
  thumb: string;
  width: number;
  height: number;
  bytes: number;
  /** When the photo was taken (EXIF) – falls back to the import time. Local ISO date-time. */
  takenAt: string;
  addedAt: string;
  caption: string;
  /** Status of the item when the photo was added – shows the progress (WIP → fertig). */
  stage: Status;
  /** Copied into the phone's photo album. */
  inAlbum: boolean;
  deletedAt: string | null;
}

export type ThemeSetting = 'auto' | 'dark' | 'light';

export interface ArchiveSettings {
  /** Signature on showcase cards ("bemalt von …"). */
  painterName: string;
  theme: ThemeSetting;
  /** Longest edge of stored photos in pixels. */
  maxEdge: number;
  /** Also save every photo into a phone album. */
  albumEnabled: boolean;
  albumName: string;
  /** Show the photo checklist before taking a picture. */
  cameraChecklist: boolean;
  gridColumns: 2 | 3;
}

export interface Archive {
  app: 'simpleArchive';
  version: 1;
  /** Identity of this archive – a backup folder belongs to exactly one archive. */
  id: string;
  items: Item[];
  photos: Photo[];
  settings: ArchiveSettings;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SETTINGS: ArchiveSettings = {
  painterName: '',
  theme: 'auto',
  maxEdge: 3072,
  albumEnabled: true,
  albumName: 'simpleArchive',
  cameraChecklist: true,
  gridColumns: 2,
};

export interface ItemDraft {
  name: string;
  kind: Kind;
  status: Status;
  tags: string[];
  favorite: boolean;
  notes: string;
  models: number;
}

/** A processed image, ready to be attached to an item. */
export interface NewPhoto {
  file: string;
  thumb: string;
  width: number;
  height: number;
  bytes: number;
  takenAt: string;
  caption?: string;
  inAlbum?: boolean;
}
