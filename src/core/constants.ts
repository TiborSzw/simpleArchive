import type { Kind, Status } from './types';

export const KINDS: Kind[] = ['mini', 'unit', 'monster', 'vehicle', 'terrain', 'diorama', 'bust', 'other'];

export const KIND_INFO: Record<Kind, { name: string; plural: string }> = {
  mini: { name: 'Miniatur', plural: 'Miniaturen' },
  unit: { name: 'Einheit', plural: 'Einheiten' },
  monster: { name: 'Monster', plural: 'Monster' },
  vehicle: { name: 'Fahrzeug', plural: 'Fahrzeuge' },
  terrain: { name: 'Terrain', plural: 'Terrain' },
  diorama: { name: 'Diorama', plural: 'Dioramen' },
  bust: { name: 'Büste', plural: 'Büsten' },
  other: { name: 'Sonstiges', plural: 'Sonstiges' },
};

export const STATUSES: Status[] = ['unpainted', 'primed', 'wip', 'done'];

export const STATUS_INFO: Record<Status, { name: string; short: string; hint: string }> = {
  unpainted: { name: 'Unbemalt', short: 'Unbemalt', hint: 'liegt noch im Karton oder auf dem Gussrahmen' },
  primed: { name: 'Grundiert', short: 'Grundiert', hint: 'gebaut und grundiert' },
  wip: { name: 'In Arbeit', short: 'In Arbeit', hint: 'steht auf der Werkbank' },
  done: { name: 'Fertig', short: 'Fertig', hint: 'bereit für die Vitrine' },
};

/** Tag suggestions shown in the editor, grouped. Users can type anything. */
export const TAG_SUGGESTIONS: { group: string; tags: string[] }[] = [
  {
    group: 'System',
    tags: [
      'Warhammer 40k',
      'Age of Sigmar',
      'The Old World',
      'Kill Team',
      'Necromunda',
      'Blood Bowl',
      'Horus Heresy',
      'Middle-earth SBG',
      'D&D',
      'Pathfinder',
      'Frostgrave',
      'Trench Crusade',
      'Star Wars Legion',
      'Marvel Crisis Protocol',
      'Bolt Action',
      'Infinity',
      'Brettspiel',
    ],
  },
  {
    group: 'Technik',
    tags: ['NMM', 'OSL', 'Kontrastfarben', 'Airbrush', 'Freihand', 'Nass-in-Nass', 'Slapchop', 'Weathering', 'Glaze', 'Trockenbürsten', 'Ölfarben', 'Pigmente'],
  },
  {
    group: 'Terrain & Base',
    tags: ['Gebäude', 'Ruine', 'Wald', 'Fels', 'Wasser', 'Schnee', 'Wüste', 'Lava', 'Sci-Fi', 'Dungeon', 'Scatter', 'Spielplatte'],
  },
  {
    group: 'Sonstiges',
    tags: ['Umbau', '3D-Druck', 'Wettbewerb', 'Commission', 'Geschenk', 'Lieblingsstück'],
  },
];

export const TRASH_DAYS = 30;
