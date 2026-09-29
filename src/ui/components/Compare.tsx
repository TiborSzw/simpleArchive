import { useRef, useState } from 'preact/hooks';
import { STATUS_INFO } from '../../core/constants';
import { dateShort } from '../../core/dates';
import { coverOf, itemTitle, photosOf } from '../../core/query';
import { Icon } from '../icons';
import { push } from '../nav';
import { archive, useStore } from '../store';
import { MediaImg, Page, Segmented } from './ui';

export function Compare({ itemId }: { itemId: string }) {
  const a = useStore(archive);
  const item = a.items.find((it) => it.id === itemId);
  const photos = photosOf(a, itemId);
  const [beforeId, setBefore] = useState(() => photos[0]?.id ?? '');
  const [afterId, setAfter] = useState(() => (item && coverOf(a, item)?.id !== photos[0]?.id ? coverOf(a, item)?.id : photos[photos.length - 1]?.id) ?? '');
  const [picking, setPicking] = useState<'before' | 'after'>('before');
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  if (!item || photos.length < 2) return null;
  const before = photos.find((p) => p.id === beforeId) ?? photos[0];
  const after = photos.find((p) => p.id === afterId) ?? photos[photos.length - 1];
  const ratio = after.width && after.height ? after.width / after.height : 3 / 4;

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <Page class="compare" title="Vorher / Nachher" actions={
      <button type="button" class="icon-btn" aria-label="Als Showcase-Karte teilen" onClick={() => push({ type: 'showcase', itemId, photoId: after.id, beforeId: before.id })}>
        <Icon name="share" />
      </button>
    }>
      <p class="muted center">{itemTitle(item)}</p>
      <div
        class="compare-box"
        ref={box}
        style={{ aspectRatio: String(ratio) }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && move(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        role="slider"
        aria-label="Vergleich verschieben"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5));
          if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5));
        }}
      >
        <MediaImg name={after.file} class="compare-img" eager />
        <div class="compare-before" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <MediaImg name={before.file} class="compare-img" eager />
        </div>
        <div class="compare-handle" style={{ left: `${pos}%` }}>
          <span class="compare-knob">
            <Icon name="compare" size={18} />
          </span>
        </div>
        <span class="compare-label left">
          {STATUS_INFO[before.stage].short} · {dateShort(before.takenAt)}
        </span>
        <span class="compare-label right">
          {STATUS_INFO[after.stage].short} · {dateShort(after.takenAt)}
        </span>
      </div>

      <div class="compare-pick">
        <Segmented
          label="Auswahl"
          value={picking}
          onChange={setPicking}
          options={[
            { value: 'before', label: 'Vorher wählen' },
            { value: 'after', label: 'Nachher wählen' },
          ]}
        />
        <div class="thumb-strip">
          {photos.map((p) => (
            <button
              type="button"
              key={p.id}
              class={`thumb ${p.id === before.id ? 'is-before' : ''} ${p.id === after.id ? 'is-after' : ''}`}
              onClick={() => (picking === 'before' ? setBefore(p.id) : setAfter(p.id))}
              aria-label={`Foto vom ${dateShort(p.takenAt)}`}
            >
              <MediaImg name={p.thumb} />
              {p.id === before.id && <span class="thumb-tag">vorher</span>}
              {p.id === after.id && <span class="thumb-tag">nachher</span>}
            </button>
          ))}
        </div>
      </div>
      <button type="button" class="btn primary wide" onClick={() => push({ type: 'showcase', itemId, photoId: after.id, beforeId: before.id })}>
        <Icon name="frame" size={18} /> Als Vorher/Nachher-Karte teilen
      </button>
    </Page>
  );
}
