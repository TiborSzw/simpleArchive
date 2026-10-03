import { useEffect, useRef, useState } from 'preact/hooks';
import { movePhoto, restorePhoto, setCover, trashPhoto, updatePhoto } from '../../core/archive';
import { STATUSES, STATUS_INFO } from '../../core/constants';
import { dateLabel } from '../../core/dates';
import { coverOf, itemTitle, liveItems, sortItems } from '../../core/query';
import type { Photo } from '../../core/types';
import { canEditPhotos } from '../../native/camera';
import { haptic } from '../../native/platform';
import { sharePhotos } from '../../native/share';
import { Icon } from '../icons';
import { editAndAdd } from '../importer';
import { interceptBack, nav, pop, push, replaceTop } from '../nav';
import { archive, mutate, toast, useStore } from '../store';
import { Chip, MediaImg, Sheet } from './ui';

interface View {
  scale: number;
  x: number;
  y: number;
}

const MAX_SCALE = 5;

/**
 * Pinch/pan/double-tap zoom and swipe navigation for one photo at a time.
 * `can` says whether there is a photo before/after – at the ends the swipe only
 * gives a little and springs back (otherwise the track stayed on an empty slide).
 */
function useGestures(onSwipe: (dir: -1 | 1) => void, onTap: () => void, resetKey: string, can: { prev: boolean; next: boolean }) {
  const canRef = useRef(can);
  canRef.current = can;
  const stage = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ scale: 1, x: 0, y: 0 });
  const [zoomed, setZoomed] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; startView: View; startDist: number; midX: number; midY: number; moved: boolean; t: number; swipe: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = (animate = false) => {
    const v = view.current;
    if (img.current) {
      img.current.style.transition = animate ? 'transform .22s ease' : 'none';
      img.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.scale})`;
    }
  };
  const setSwipe = (dx: number, animate = false) => {
    if (!track.current) return;
    track.current.style.transition = animate ? 'transform .25s ease' : 'none';
    track.current.style.transform = `translateX(calc(-100% + ${dx}px))`;
  };

  const clamp = (v: View): View => {
    const el = stage.current;
    if (!el) return v;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const maxX = ((v.scale - 1) * w) / 2;
    const maxY = ((v.scale - 1) * h) / 2;
    return { scale: v.scale, x: Math.max(-maxX, Math.min(maxX, v.x)), y: Math.max(-maxY, Math.min(maxY, v.y)) };
  };

  const reset = (animate = false) => {
    view.current = { scale: 1, x: 0, y: 0 };
    apply(animate);
    setZoomed(false);
  };

  useEffect(() => {
    reset();
    setSwipe(0);
  }, [resetKey]);

  // Back leaves zoom first.
  useEffect(
    () =>
      interceptBack(() => {
        if (view.current.scale > 1.01) {
          reset(true);
          return true;
        }
        return false;
      }),
    [],
  );

  const zoomAt = (clientX: number, clientY: number, scale: number) => {
    const el = stage.current!;
    const r = el.getBoundingClientRect();
    const px = clientX - r.left - r.width / 2;
    const py = clientY - r.top - r.height / 2;
    const v = view.current;
    const k = scale / v.scale;
    view.current = clamp({ scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    apply(true);
    setZoomed(scale > 1.01);
  };

  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const mid = pts.length === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : { x: e.clientX, y: e.clientY };
    gesture.current = {
      startX: mid.x,
      startY: mid.y,
      startView: { ...view.current },
      startDist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      midX: mid.x,
      midY: mid.y,
      moved: gesture.current?.moved ?? false,
      t: Date.now(),
      swipe: 0,
    };
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length >= 2 && g.startDist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const scale = Math.max(1, Math.min(MAX_SCALE, (g.startView.scale * dist) / g.startDist));
      const r = stage.current!.getBoundingClientRect();
      const px = g.midX - r.left - r.width / 2;
      const py = g.midY - r.top - r.height / 2;
      const k = scale / g.startView.scale;
      view.current = clamp({ scale, x: px - (px - g.startView.x) * k + (mid.x - g.midX), y: py - (py - g.startView.y) * k + (mid.y - g.midY) });
      g.moved = true;
      apply();
      return;
    }
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.moved = true;
    if (view.current.scale > 1.01) {
      view.current = clamp({ ...g.startView, x: g.startView.x + dx, y: g.startView.y + dy });
      apply();
    } else if (Math.abs(dx) > Math.abs(dy)) {
      const blocked = (dx < 0 && !canRef.current.next) || (dx > 0 && !canRef.current.prev);
      g.swipe = blocked ? 0 : dx;
      setSwipe(blocked ? dx * 0.2 : dx);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (pointers.current.size > 0) {
      // One finger of a pinch lifted: continue as a pan from here.
      const [p] = [...pointers.current.values()];
      gesture.current = { ...g, startX: p.x, startY: p.y, startView: { ...view.current }, startDist: 0 };
      return;
    }
    gesture.current = null;
    setZoomed(view.current.scale > 1.01);
    if (view.current.scale <= 1.01 && !g.swipe) setSwipe(0, true);
    if (view.current.scale <= 1.01 && g.swipe) {
      const w = stage.current?.clientWidth ?? 360;
      const fast = Math.abs(g.swipe) / Math.max(1, Date.now() - g.t) > 0.5;
      if (Math.abs(g.swipe) > w * 0.2 || (fast && Math.abs(g.swipe) > 30)) {
        const dir = g.swipe < 0 ? 1 : -1;
        setSwipe(dir === 1 ? -w : w, true);
        setTimeout(() => onSwipe(dir), 200);
      } else setSwipe(0, true);
      return;
    }
    if (g.moved) return;
    // Tap: double tap zooms, single tap toggles the controls.
    const now = Date.now();
    const lt = lastTap.current;
    if (lt && now - lt.t < 300 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 30) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = null;
      if (view.current.scale > 1.01) reset(true);
      else zoomAt(e.clientX, e.clientY, 2.5);
      return;
    }
    lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    tapTimer.current = setTimeout(onTap, 260);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const next = Math.max(1, Math.min(MAX_SCALE, view.current.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    zoomAt(e.clientX, e.clientY, next);
  };

  return { stage, track, img, zoomed, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onWheel } };
}

function InfoSheet({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const a = useStore(archive);
  const [caption, setCaption] = useState(photo.caption);
  const [moving, setMoving] = useState(false);
  const item = a.items.find((it) => it.id === photo.itemId);
  const save = () => {
    if (caption !== photo.caption) mutate((x, now) => updatePhoto(x, photo.id, { caption: caption.trim() }, now));
    onClose();
  };
  if (moving) {
    const targets = sortItems(a, liveItems(a), 'recent').filter((it) => it.id !== photo.itemId);
    return (
      <Sheet title="Zu welchem Werk gehört das Foto?" onClose={() => setMoving(false)} class="target-sheet">
        <div class="target-list">
          {targets.map((it) => {
            const c = coverOf(a, it);
            return (
              <button
                type="button"
                class="target"
                key={it.id}
                onClick={() => {
                  mutate((x, now) => movePhoto(x, photo.id, it.id, now));
                  toast({ text: 'Foto verschoben', sub: itemTitle(it), tone: 'good' });
                  onClose();
                }}
              >
                {c ? <MediaImg name={c.thumb} class="target-thumb" /> : <span class="target-thumb placeholder" />}
                <span>{itemTitle(it)}</span>
              </button>
            );
          })}
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title="Foto-Details" onClose={save}>
      <p class="muted small">
        Aufgenommen am {dateLabel(photo.takenAt)} · {photo.width}×{photo.height}
        {item && ` · ${itemTitle(item)}`}
      </p>
      <label class="field">
        <span>Bildunterschrift</span>
        <input type="text" value={caption} maxLength={200} placeholder="z. B. erste Highlights, Basing fertig …" onInput={(e) => setCaption((e.target as HTMLInputElement).value)} />
      </label>
      <div class="field">
        <span>Stand auf dem Foto</span>
        <div class="chip-wrap">
          {STATUSES.map((s) => (
            <Chip key={s} active={photo.stage === s} onClick={() => mutate((x, now) => updatePhoto(x, photo.id, { stage: s }, now))} class={`chip-status s-${s}`}>
              {STATUS_INFO[s].short}
            </Chip>
          ))}
        </div>
      </div>
      <div class="sheet-buttons">
        <button type="button" class="btn ghost" onClick={() => setMoving(true)}>
          <Icon name="move" size={18} /> Anderem Werk zuordnen
        </button>
        <button type="button" class="btn primary" onClick={save}>
          Fertig
        </button>
      </div>
    </Sheet>
  );
}

export function PhotoViewer({ photoIds, index }: { photoIds: string[]; index: number }) {
  const a = useStore(archive);
  const [chrome, setChrome] = useState(true);
  const [info, setInfo] = useState(false);
  const photos = photoIds.map((id) => a.photos.find((p) => p.id === id && !p.deletedAt)).filter((p): p is Photo => !!p);
  const i = Math.min(Math.max(0, index), photos.length - 1);
  const photo = photos[i];

  const go = (dir: -1 | 1) => {
    const next = i + dir;
    if (next < 0 || next >= photos.length) return;
    replaceTop({ type: 'viewer', photoIds: photos.map((p) => p.id), index: next });
  };
  const g = useGestures((dir) => go(dir), () => setChrome((c) => !c), photo?.id ?? '', { prev: i > 0, next: i < photos.length - 1 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!photo) pop();
  }, [photo]);
  if (!photo) return null;

  const item = a.items.find((it) => it.id === photo.itemId);
  const isCover = item ? coverOf(a, item)?.id === photo.id : false;
  const title = item ? itemTitle(item) : '';
  const cameFromItem = nav.get().stack.some((s) => s.type === 'item' && s.id === photo.itemId);

  const remove = () => {
    mutate((x, now) => trashPhoto(x, photo.id, now));
    toast({ text: 'Foto im Papierkorb', action: { label: 'Rückgängig', run: () => mutate((x, now) => restorePhoto(x, photo.id, now)) } }, 6000);
    const rest = photos.filter((p) => p.id !== photo.id);
    if (!rest.length) pop();
    else replaceTop({ type: 'viewer', photoIds: rest.map((p) => p.id), index: Math.min(i, rest.length - 1) });
  };

  const prev = photos[i - 1];
  const next = photos[i + 1];

  return (
    <div class={`viewer ${chrome ? '' : 'no-chrome'}`} role="dialog" aria-modal="true" aria-label="Foto">
      <div class="viewer-stage" ref={g.stage} {...g.handlers}>
        <div class="viewer-track" ref={g.track}>
          <div class="viewer-slide">{prev && <MediaImg name={prev.file} class="viewer-img" />}</div>
          <div class="viewer-slide">
            <div class="viewer-zoom" ref={g.img}>
              <MediaImg name={photo.thumb} class="viewer-img viewer-thumb" eager />
              <MediaImg name={photo.file} class="viewer-img" alt={photo.caption || title} eager />
            </div>
          </div>
          <div class="viewer-slide">{next && <MediaImg name={next.file} class="viewer-img" />}</div>
        </div>
      </div>

      <header class="viewer-top">
        <button type="button" class="icon-btn" onClick={pop} aria-label="Schließen">
          <Icon name="x" />
        </button>
        <button
          type="button"
          class="viewer-title"
          onClick={() => item && !cameFromItem && push({ type: 'item', id: item.id })}
          disabled={cameFromItem}
        >
          <strong>{title}</strong>
          <small>
            {photos.length > 1 && `${i + 1} / ${photos.length} · `}
            {STATUS_INFO[photo.stage].short} · {dateLabel(photo.takenAt)}
          </small>
        </button>
        <span class="icon-btn-spacer" />
      </header>

      {photo.caption && chrome && <p class="viewer-caption">{photo.caption}</p>}

      <footer class="viewer-bar">
        <button type="button" onClick={() => void sharePhotos([{ file: photo.file, name: title }], title).catch(() => undefined)}>
          <Icon name="share" />
          <span>Teilen</span>
        </button>
        {item && (
          <button type="button" onClick={() => item && push({ type: 'showcase', itemId: item.id, photoId: photo.id })}>
            <Icon name="frame" />
            <span>Showcase</span>
          </button>
        )}
        <button
          type="button"
          class={isCover ? 'on' : ''}
          onClick={() => {
            if (!item) return;
            haptic('tap');
            mutate((x, now) => setCover(x, item.id, isCover ? null : photo.id, now));
            if (!isCover) toast({ text: 'Als Titelbild gesetzt', tone: 'good' }, 2000);
          }}
          aria-pressed={isCover}
        >
          <Icon name={isCover ? 'starFill' : 'star'} />
          <span>Titelbild</span>
        </button>
        {canEditPhotos && (
          <button type="button" onClick={() => void editAndAdd(photo)}>
            <Icon name="crop" />
            <span>Zuschneiden</span>
          </button>
        )}
        <button type="button" onClick={() => setInfo(true)}>
          <Icon name="info" />
          <span>Details</span>
        </button>
        <button type="button" onClick={remove}>
          <Icon name="trash" />
          <span>Löschen</span>
        </button>
      </footer>
      {g.zoomed && <div class="zoom-hint">Doppeltippen zum Verkleinern</div>}
      {info && <InfoSheet photo={photo} onClose={() => setInfo(false)} />}
    </div>
  );
}
