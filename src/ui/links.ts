// Links from the other simple* apps.
//
//   simplearchive://werk?ref=simplearmy:termagants&name=Termagants&kind=unit
//       &models=10&status=done&tags=Warhammer%2040K,Tyranids&photo=1
//
// opens the item that carries this ref – or creates it – and, with photo=1,
// offers to take a picture right away. simpleArmy sends this when a unit is
// painted. Nothing is ever deleted or overwritten except the status, which
// only moves forward (a finished item stays finished).
import { App as CapApp } from '@capacitor/app';
import { createItem, updateItem } from '../core/archive';
import { STATUSES } from '../core/constants';
import { parseLink, type ItemLink } from '../core/links';
import { isNative } from '../native/platform';
import { importPhotos } from './importer';
import { nav, push } from './nav';
import { archive, mutate, toast } from './store';

/** Opens or creates the item for a link. Returns its id. */
export function applyLink(link: ItemLink): string {
  const existing = archive.get().items.find((it) => !it.deletedAt && it.ref === link.ref);
  let id = existing?.id ?? '';
  if (existing) {
    const forward = STATUSES.indexOf(link.status) > STATUSES.indexOf(existing.status);
    if (forward || existing.models !== link.models)
      mutate((a, now) => updateItem(a, existing.id, { ...(forward ? { status: link.status } : {}), models: link.models }, now));
  } else {
    mutate((a, now) => {
      const created = createItem(a, { name: link.name, kind: link.kind, status: link.status, tags: link.tags, models: link.models, ref: link.ref }, now);
      id = created.item.id;
      return created.archive;
    });
  }
  const top = nav.get().stack.at(-1);
  if (!(top?.type === 'item' && top.id === id)) push({ type: 'item', id });
  toast(
    {
      text: existing ? 'Aus simpleArmy geöffnet' : 'Aus simpleArmy angelegt',
      sub: link.name,
      tone: 'good',
      ...(link.photo ? { action: { label: 'Foto machen', run: () => void importPhotos('camera', id) } } : {}),
    },
    8000,
  );
  return id;
}

function handle(url: string | undefined | null) {
  const link = url ? parseLink(url) : null;
  if (link) applyLink(link);
}

/** Listens for links (app already running) and handles the one that started the app. */
export function initLinks() {
  if (!isNative) return;
  void CapApp.addListener('appUrlOpen', ({ url }) => handle(url));
  void CapApp.getLaunchUrl()
    .then((r) => handle(r?.url))
    .catch(() => undefined);
}

export { armyUnit } from '../core/links';
