import { useMemo, useState } from 'preact/hooks';
import { updateSettings } from '../../core/archive';
import { STATUS_INFO } from '../../core/constants';
import { coverOf, filterItems, EMPTY_FILTER, itemTitle } from '../../core/query';
import type { NewPhoto } from '../../core/types';
import { Icon } from '../icons';
import { attach, discard, importPhotos } from '../importer';
import { closeSheet, nav, openSheet, push, type SheetKind } from '../nav';
import { archive, mutate, useStore } from '../store';
import { MediaImg, Sheet, SheetAction, StatusDot } from './ui';

export const QUICK_CHECKLIST = [
  { title: 'Licht von vorne-oben', text: 'Zwei Lampen oder Fenster ohne direkte Sonne – keine Deckenlampe allein.' },
  { title: 'Ruhiger Hintergrund', text: 'Weißes, graues oder schwarzes Papier als Hohlkehle.' },
  { title: '2× Zoom statt ganz nah ran', text: 'Weniger Verzerrung, mehr Schärfentiefe – zuschneiden kannst du danach.' },
  { title: 'Aufs Gesicht tippen & abdunkeln', text: 'Fokus setzen, Belichtung leicht runter, bis Weiß nicht mehr ausfrisst.' },
  { title: 'Handy auflegen', text: 'Stativ oder Bücherstapel, Selbstauslöser 2 s.' },
];

function AddSheet({ itemId }: { itemId: string | null }) {
  const a = useStore(archive);
  const item = itemId ? a.items.find((it) => it.id === itemId) : null;
  const camera = () => {
    if (a.settings.cameraChecklist) openSheet({ type: 'checklist', then: () => void importPhotos('camera', itemId) });
    else void importPhotos('camera', itemId);
  };
  return (
    <Sheet title={item ? `Foto zu „${itemTitle(item)}“` : 'Hinzufügen'} onClose={closeSheet}>
      <SheetAction icon="camera" label="Foto aufnehmen" hint="mit der Kamera" onClick={camera} />
      <SheetAction icon="images" label="Aus der Galerie" hint="mehrere Fotos auf einmal möglich" onClick={() => void importPhotos('gallery', itemId)} />
      {!itemId && (
        <SheetAction
          icon="box"
          label="Werk ohne Foto"
          hint="für den Pile of Shame – Foto kommt später"
          onClick={() => {
            closeSheet();
            push({ type: 'editor', itemId: null, status: 'unpainted' });
          }}
        />
      )}
    </Sheet>
  );
}

function ChecklistSheet({ then }: { then: () => void }) {
  const [checked, setChecked] = useState<boolean[]>(() => QUICK_CHECKLIST.map(() => false));
  const go = () => {
    closeSheet();
    then();
  };
  return (
    <Sheet title="Kurz vorm Auslösen" onClose={closeSheet} class="checklist-sheet">
      <ul class="checklist">
        {QUICK_CHECKLIST.map((c, i) => (
          <li key={c.title}>
            <label>
              <input type="checkbox" checked={checked[i]} onChange={() => setChecked((x) => x.map((v, j) => (j === i ? !v : v)))} />
              <span>
                <strong>{c.title}</strong>
                <small>{c.text}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div class="sheet-buttons">
        <button
          type="button"
          class="btn ghost small"
          onClick={() => {
            mutate((x, now) => updateSettings(x, { cameraChecklist: false }, now));
            go();
          }}
        >
          Nicht mehr zeigen
        </button>
        <button type="button" class="btn primary" onClick={go}>
          <Icon name="camera" size={18} /> Kamera öffnen
        </button>
      </div>
      <button
        type="button"
        class="link-btn center"
        onClick={() => {
          closeSheet();
          push({ type: 'lesson', id: 'quick' });
        }}
      >
        Mehr in der Fotoschule
      </button>
    </Sheet>
  );
}

/** Where do the freshly imported photos belong? */
function TargetSheet({ photos }: { photos: NewPhoto[] }) {
  const a = useStore(archive);
  const [q, setQ] = useState('');
  const items = useMemo(() => filterItems(a, { ...EMPTY_FILTER, q }).slice(0, 60), [a, q]);
  const cancel = () => {
    void discard(photos);
    closeSheet();
  };
  const choose = (itemId: string) => {
    closeSheet();
    attach(itemId, photos);
    if (!nav.get().stack.some((s) => s.type === 'item' && s.id === itemId)) push({ type: 'item', id: itemId });
  };
  return (
    <Sheet title={photos.length === 1 ? 'Wohin mit dem Foto?' : `Wohin mit den ${photos.length} Fotos?`} onClose={cancel} class="target-sheet">
      <div class="target-preview">
        {photos.slice(0, 6).map((p) => (
          <MediaImg key={p.file} name={p.thumb} />
        ))}
        {photos.length > 6 && <span class="more">+{photos.length - 6}</span>}
      </div>
      <SheetAction
        icon="plus"
        label="Neues Werk anlegen"
        onClick={() => {
          // Hand the photos over to the editor (which owns them from now on).
          nav.set((s) => ({ ...s, sheet: null, stack: [...s.stack, { type: 'editor', itemId: null, photos }] }));
        }}
      />
      <div class="search small">
        <Icon name="search" size={16} />
        <input type="search" placeholder="Bestehendes Werk suchen …" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Werk suchen" />
      </div>
      <div class="target-list">
        {items.map((it) => {
          const c = coverOf(a, it);
          return (
            <button type="button" class="target" key={it.id} onClick={() => choose(it.id)}>
              {c ? <MediaImg name={c.thumb} class="target-thumb" /> : <span class="target-thumb placeholder" />}
              <span class="target-text">
                <strong>{itemTitle(it)}</strong>
                <small>
                  <StatusDot status={it.status} /> {STATUS_INFO[it.status].short}
                </small>
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

export function SheetHost({ sheet }: { sheet: SheetKind | null }) {
  if (!sheet) return null;
  if (sheet.type === 'add') return <AddSheet itemId={sheet.itemId} />;
  if (sheet.type === 'checklist') return <ChecklistSheet then={sheet.then} />;
  return <TargetSheet photos={sheet.photos} />;
}
