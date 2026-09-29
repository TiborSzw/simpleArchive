import { useMemo, useRef, useState } from 'preact/hooks';
import { KINDS, KIND_INFO, STATUSES, STATUS_INFO } from '../../core/constants';
import { monthLabel } from '../../core/dates';
import { EMPTY_FILTER, coverOf, filterItems, groupByMonth, isFiltering, itemTitle, photosOf, photosOfItems, tagIndex, type Filter, type SortMode } from '../../core/query';
import { hasTag, removeTag } from '../../core/tags';
import { toggleFavorite } from '../../core/archive';
import type { Archive, Item } from '../../core/types';
import { haptic } from '../../native/platform';
import { Icon } from '../icons';
import { openSheet, push } from '../nav';
import { archive, createStore, mutate, useStore } from '../store';
import { Chip, Empty, MediaImg, Segmented, Sheet, StatusDot, fmtNum } from './ui';

export const galleryFilter = createStore<Filter>({ ...EMPTY_FILTER });
export const galleryView = createStore<'works' | 'photos'>('works');

const SORT_LABEL: Record<SortMode, string> = { recent: 'Zuletzt bearbeitet', finished: 'Fertigstellung', created: 'Neu hinzugefügt', name: 'Name A–Z' };

function setFilter(patch: Partial<Filter>) {
  galleryFilter.set((f) => ({ ...f, ...patch }));
}

/** Distributes cards into columns by their real image height – a calm masonry. */
function masonry(a: Archive, items: Item[], columns: number) {
  const cols: { item: Item; ratio: number }[][] = Array.from({ length: columns }, () => []);
  const heights = new Array(columns).fill(0);
  for (const item of items) {
    const cover = coverOf(a, item);
    const ratio = cover && cover.width && cover.height ? Math.min(1.6, Math.max(0.72, cover.height / cover.width)) : 1.15;
    let target = 0;
    for (let i = 1; i < columns; i++) if (heights[i] < heights[target] - 0.05) target = i;
    cols[target].push({ item, ratio });
    heights[target] += ratio + 0.28; // + caption
  }
  return cols;
}

export function ItemCard({ a, item, ratio }: { a: Archive; item: Item; ratio: number }) {
  const cover = coverOf(a, item);
  const count = photosOf(a, item.id).length;
  return (
    <div class={`card s-${item.status}`}>
      <button type="button" class="card-hit" onClick={() => push({ type: 'item', id: item.id })} aria-label={`${itemTitle(item)} öffnen`}>
        <div class="card-img" style={{ aspectRatio: `1 / ${ratio}` }}>
          {cover ? (
            <MediaImg name={cover.thumb} alt="" />
          ) : (
            <div class="card-placeholder">
              <Icon name={item.status === 'unpainted' || item.status === 'primed' ? 'box' : 'brush'} size={34} />
            </div>
          )}
          {count > 1 && (
            <span class="card-count" aria-label={`${count} Fotos`}>
              <Icon name="images" size={13} />
              {count}
            </span>
          )}
        </div>
        <div class="card-meta">
          <strong class="card-title">{itemTitle(item)}</strong>
          <span class="card-sub">
            <StatusDot status={item.status} />
            {STATUS_INFO[item.status].short}
            {item.models > 1 && <span class="card-models"> · {item.models}×</span>}
          </span>
        </div>
      </button>
      <button
        type="button"
        class={`card-fav ${item.favorite ? 'on' : ''}`}
        aria-label={item.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
        aria-pressed={item.favorite}
        onClick={() => {
          haptic('tap');
          mutate((x, now) => toggleFavorite(x, item.id, now));
        }}
      >
        <Icon name={item.favorite ? 'heartFill' : 'heart'} size={19} />
      </button>
    </div>
  );
}

function FilterSheet({ onClose }: { onClose: () => void }) {
  const a = useStore(archive);
  const f = useStore(galleryFilter);
  const tags = tagIndex(a);
  return (
    <Sheet title="Filtern & sortieren" onClose={onClose} class="filter-sheet">
      <h3 class="sheet-sub">Sortierung</h3>
      <div class="chip-wrap">
        {(Object.keys(SORT_LABEL) as SortMode[]).map((s) => (
          <Chip key={s} active={f.sort === s} onClick={() => setFilter({ sort: s })}>
            {SORT_LABEL[s]}
          </Chip>
        ))}
      </div>
      <h3 class="sheet-sub">Art</h3>
      <div class="chip-wrap">
        {KINDS.map((k) => (
          <Chip key={k} active={f.kinds.includes(k)} onClick={() => setFilter({ kinds: f.kinds.includes(k) ? f.kinds.filter((x) => x !== k) : [...f.kinds, k] })}>
            {KIND_INFO[k].plural}
          </Chip>
        ))}
      </div>
      <h3 class="sheet-sub">Tags {f.tags.length > 1 && <small>(alle müssen passen)</small>}</h3>
      {tags.length ? (
        <div class="chip-wrap">
          {tags.map((t) => (
            <Chip key={t.tag} icon="tag" active={hasTag(f.tags, t.tag)} onClick={() => setFilter({ tags: hasTag(f.tags, t.tag) ? removeTag(f.tags, t.tag) : [...f.tags, t.tag] })}>
              {t.tag} <small>{t.count}</small>
            </Chip>
          ))}
        </div>
      ) : (
        <p class="muted small">Noch keine Tags vergeben – das geht beim Bearbeiten eines Werks.</p>
      )}
      <div class="sheet-buttons">
        <button type="button" class="btn ghost" onClick={() => galleryFilter.set({ ...EMPTY_FILTER, sort: f.sort })} disabled={!isFiltering(f)}>
          Zurücksetzen
        </button>
        <button type="button" class="btn primary" onClick={onClose}>
          Fertig
        </button>
      </div>
    </Sheet>
  );
}

export function Gallery() {
  const a = useStore(archive);
  const f = useStore(galleryFilter);
  const view = useStore(galleryView);
  const [searching, setSearching] = useState(!!f.q);
  const [filterOpen, setFilterOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const columns = a.settings.gridColumns;

  const items = useMemo(() => filterItems(a, f), [a, f]);
  const all = useMemo(() => a.items.filter((it) => !it.deletedAt), [a]);
  const tags = useMemo(() => tagIndex(a).slice(0, 12), [a]);
  const cols = useMemo(() => masonry(a, items, columns), [a, items, columns]);
  const photos = useMemo(() => (view === 'photos' ? photosOfItems(a, items) : []), [a, items, view]);
  const groups = useMemo(() => groupByMonth(photos), [photos]);
  const photoIds = useMemo(() => photos.map((x) => x.id), [photos]);
  const photoIndex = useMemo(() => new Map(photoIds.map((id, i) => [id, i])), [photoIds]);
  const totalPhotos = useMemo(() => photosOfItems(a, all).length, [a, all]);
  const filtering = isFiltering(f);

  const toggleStatus = (s: (typeof STATUSES)[number]) => setFilter({ statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s] });

  return (
    <div class="gallery">
      <header class="tab-header">
        <div class="tab-heading">
          <h1 class="display">Vitrine</h1>
          <p class="muted">
            {fmtNum(all.length)} {all.length === 1 ? 'Werk' : 'Werke'} · {fmtNum(totalPhotos)} {totalPhotos === 1 ? 'Foto' : 'Fotos'}
          </p>
        </div>
        <div class="tab-actions">
          <button
            type="button"
            class={`icon-btn ${searching ? 'on' : ''}`}
            aria-label="Suchen"
            onClick={() => {
              if (searching) {
                setSearching(false);
                setFilter({ q: '' });
              } else {
                setSearching(true);
                setTimeout(() => searchRef.current?.focus(), 30);
              }
            }}
          >
            <Icon name={searching ? 'x' : 'search'} />
          </button>
          <button type="button" class={`icon-btn ${f.kinds.length || f.tags.length || f.sort !== 'recent' ? 'on' : ''}`} aria-label="Filtern und sortieren" onClick={() => setFilterOpen(true)}>
            <Icon name="sliders" />
          </button>
        </div>
      </header>

      {searching && (
        <div class="search">
          <Icon name="search" size={18} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Name, Tag, Notiz …"
            value={f.q}
            onInput={(e) => setFilter({ q: (e.target as HTMLInputElement).value })}
            enterKeyHint="search"
            aria-label="Suche"
          />
        </div>
      )}

      {all.length > 0 && (
        <div class="filter-row" role="toolbar" aria-label="Filter">
          <Segmented
            label="Ansicht"
            value={view}
            onChange={(v) => galleryView.set(v)}
            options={[
              { value: 'works', label: 'Werke', icon: 'grid' },
              { value: 'photos', label: 'Fotos', icon: 'timeline' },
            ]}
          />
          <Chip icon={f.favorites ? 'heartFill' : 'heart'} active={f.favorites} onClick={() => setFilter({ favorites: !f.favorites })} class="chip-fav">
            Favoriten
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={f.statuses.includes(s)} onClick={() => toggleStatus(s)} class={`chip-status s-${s}`}>
              <StatusDot status={s} />
              {STATUS_INFO[s].short}
            </Chip>
          ))}
          {tags.map((t) => (
            <Chip key={t.tag} icon="tag" active={hasTag(f.tags, t.tag)} onClick={() => setFilter({ tags: hasTag(f.tags, t.tag) ? removeTag(f.tags, t.tag) : [...f.tags, t.tag] })}>
              {t.tag}
            </Chip>
          ))}
        </div>
      )}

      {filtering && (
        <p class="filter-summary">
          {items.length} von {all.length} Werken
          <button type="button" class="link-btn" onClick={() => galleryFilter.set({ ...EMPTY_FILTER, sort: f.sort })}>
            Filter löschen
          </button>
        </p>
      )}

      {!all.length ? (
        <Empty
          icon="frame"
          title="Deine Vitrine ist noch leer"
          action={
            <div class="empty-actions">
              <button type="button" class="btn primary" onClick={() => openSheet({ type: 'add', itemId: null })}>
                <Icon name="camera" size={18} /> Erstes Werk fotografieren
              </button>
              <button type="button" class="btn ghost" onClick={() => push({ type: 'lesson', id: 'quick' })}>
                <Icon name="bulb" size={18} /> Tipps für gute Mini-Fotos
              </button>
            </div>
          }
        >
          Fotografiere deine bemalten Miniaturen und dein Terrain – oder trag erst mal ein, was noch auf dem Pile of Shame liegt.
        </Empty>
      ) : !items.length ? (
        <Empty icon="search" title="Nichts gefunden">
          Kein Werk passt zu diesen Filtern.
        </Empty>
      ) : view === 'works' ? (
        <div class={`masonry cols-${columns}`}>
          {cols.map((col, i) => (
            <div class="masonry-col" key={i}>
              {col.map(({ item, ratio }) => (
                <ItemCard key={item.id} a={a} item={item} ratio={ratio} />
              ))}
            </div>
          ))}
        </div>
      ) : !photos.length ? (
        <Empty icon="images" title="Noch keine Fotos">
          Diese Werke haben noch keine Fotos.
        </Empty>
      ) : (
        <div class="timeline">
          {groups.map((g) => (
            <section key={g.month} class="month">
              <h2 class="month-title">
                {monthLabel(g.month)} <span class="muted">{g.entries.length}</span>
              </h2>
              <div class="photo-grid">
                {g.entries.map((p) => (
                  <button type="button" class="photo-cell" key={p.id} onClick={() => push({ type: 'viewer', photoIds, index: photoIndex.get(p.id) ?? 0 })} aria-label="Foto öffnen">
                    <MediaImg name={p.thumb} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {filterOpen && <FilterSheet onClose={() => setFilterOpen(false)} />}
    </div>
  );
}
