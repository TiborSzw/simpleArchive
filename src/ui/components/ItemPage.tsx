import { useState } from 'preact/hooks';
import { restoreItem, toggleFavorite, trashItem, updateItem } from '../../core/archive';
import { KIND_INFO, STATUS_INFO } from '../../core/constants';
import { dateShort, daysBetween, nowLocal, relativeLabel } from '../../core/dates';
import { coverOf, itemTitle, photosOf } from '../../core/query';
import type { Status } from '../../core/types';
import { haptic } from '../../native/platform';
import { sharePhotos } from '../../native/share';
import { galleryFilter, galleryView } from './Gallery';
import { armyUnit } from '../links';
import { Icon } from '../icons';
import { dropScreensFor, openSheet, push, setTab } from '../nav';
import { archive, mutate, toast, useStore } from '../store';
import { Chip, MediaImg, Page, Sheet, SheetAction, StatusStepper } from './ui';
import { EMPTY_FILTER } from '../../core/query';

export function ItemPage({ id }: { id: string }) {
  const a = useStore(archive);
  const item = a.items.find((it) => it.id === id);
  const [menu, setMenu] = useState(false);
  if (!item || item.deletedAt) return null;

  const photos = photosOf(a, id);
  const cover = coverOf(a, item);
  const photoIds = photos.map((p) => p.id);
  const openViewer = (photoId: string) => push({ type: 'viewer', photoIds, index: Math.max(0, photoIds.indexOf(photoId)) });
  const title = itemTitle(item);

  const setStatus = (s: Status) => {
    const was = item.status;
    mutate((x, now) => updateItem(x, id, { status: s }, now));
    if (s === 'done' && was !== 'done') {
      haptic('success');
      toast(
        {
          text: 'Fertig! Ab in die Vitrine.',
          sub: photos.length ? 'Zeit für eine Showcase-Karte?' : 'Jetzt noch ein schönes Foto machen?',
          tone: 'good',
          action: photos.length ? { label: 'Karte', run: () => push({ type: 'showcase', itemId: id }) } : { label: 'Foto', run: () => openSheet({ type: 'add', itemId: id }) },
        },
        6000,
      );
    }
  };

  const trash = () => {
    setMenu(false);
    mutate((x, now) => trashItem(x, id, now));
    dropScreensFor(id);
    toast({ text: `„${title}“ im Papierkorb`, sub: '30 Tage lang wiederherstellbar', action: { label: 'Rückgängig', run: () => mutate((x, now) => restoreItem(x, id, now)) } }, 6000);
  };

  const workDays = item.startedAt ? daysBetween(item.startedAt, item.finishedAt ?? nowLocal()) : null;

  return (
    <Page
      class="item-page"
      title=""
      actions={
        <>
          <button
            type="button"
            class={`icon-btn fav ${item.favorite ? 'on' : ''}`}
            aria-pressed={item.favorite}
            aria-label={item.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
            onClick={() => {
              haptic('tap');
              mutate((x, now) => toggleFavorite(x, id, now));
            }}
          >
            <Icon name={item.favorite ? 'heartFill' : 'heart'} />
          </button>
          <button type="button" class="icon-btn" aria-label="Mehr" onClick={() => setMenu(true)}>
            <Icon name="more" />
          </button>
        </>
      }
    >
      <div class="hero">
        {cover ? (
          <button type="button" class="hero-img" onClick={() => openViewer(cover.id)} aria-label="Titelbild groß ansehen">
            <MediaImg name={cover.thumb} class="hero-blur" eager />
            <MediaImg name={cover.file} class="hero-photo" alt={title} eager />
          </button>
        ) : (
          <button type="button" class="hero-empty" onClick={() => openSheet({ type: 'add', itemId: id })}>
            <Icon name="camera" size={34} />
            <span>Erstes Foto hinzufügen</span>
          </button>
        )}
      </div>

      <div class="item-head">
        <h1 class="display item-title">{title}</h1>
        <p class="item-kind muted">
          {KIND_INFO[item.kind].name}
          {item.models > 1 && ` · ${item.models} Modelle`}
          {' · '}
          {STATUS_INFO[item.status].hint}
        </p>
      </div>

      <StatusStepper value={item.status} onChange={setStatus} />

      <div class="item-dates">
        {item.startedAt && (
          <span>
            <Icon name="brush" size={15} /> begonnen {dateShort(item.startedAt)}
          </span>
        )}
        {item.finishedAt && (
          <span>
            <Icon name="check" size={15} /> fertig {dateShort(item.finishedAt)}
          </span>
        )}
        {workDays !== null && workDays > 0 && (
          <span>
            <Icon name="clock" size={15} /> {workDays} {workDays === 1 ? 'Tag' : 'Tage'} {item.finishedAt ? 'an der Werkbank' : 'in Arbeit'}
          </span>
        )}
        {!item.startedAt && (
          <span>
            <Icon name="box" size={15} /> im Archiv seit {relativeLabel(item.createdAt, nowLocal()).replace(/^vor /, '')}
          </span>
        )}
      </div>

      {item.tags.length > 0 && (
        <div class="chip-wrap item-tags">
          {item.tags.map((t) => (
            <Chip
              key={t}
              icon="tag"
              onClick={() => {
                galleryFilter.set({ ...EMPTY_FILTER, tags: [t] });
                galleryView.set('works');
                setTab('gallery');
              }}
              title={`Alle Werke mit „${t}“`}
            >
              {t}
            </Chip>
          ))}
        </div>
      )}

      <div class="item-actions">
        <button type="button" class="action" onClick={() => openSheet({ type: 'add', itemId: id })}>
          <Icon name="camera" />
          <span>Foto</span>
        </button>
        <button type="button" class="action" onClick={() => push({ type: 'showcase', itemId: id })} disabled={!photos.length}>
          <Icon name="frame" />
          <span>Showcase</span>
        </button>
        <button type="button" class="action" onClick={() => push({ type: 'compare', itemId: id })} disabled={photos.length < 2}>
          <Icon name="compare" />
          <span>Vorher/Nachher</span>
        </button>
        <button type="button" class="action" onClick={() => push({ type: 'editor', itemId: id })}>
          <Icon name="edit" />
          <span>Bearbeiten</span>
        </button>
      </div>

      {photos.length > 0 && (
        <section class="section">
          <h2 class="section-title">
            Verlauf <span class="muted">{photos.length}</span>
          </h2>
          <div class="progress-strip">
            {photos.map((p) => (
              <button type="button" class={`progress-cell ${p.id === cover?.id ? 'is-cover' : ''}`} key={p.id} onClick={() => openViewer(p.id)} aria-label={`Foto vom ${dateShort(p.takenAt)}`}>
                <MediaImg name={p.thumb} />
                <span class={`stage s-${p.stage}`}>{STATUS_INFO[p.stage].short}</span>
                <span class="cell-date">{dateShort(p.takenAt)}</span>
                {p.id === cover?.id && (
                  <span class="cover-badge" title="Titelbild">
                    <Icon name="starFill" size={12} />
                  </span>
                )}
              </button>
            ))}
            <button type="button" class="progress-cell add" onClick={() => openSheet({ type: 'add', itemId: id })} aria-label="Foto hinzufügen">
              <Icon name="plus" size={26} />
            </button>
          </div>
        </section>
      )}

      <section class="section">
        <h2 class="section-title">Rezept & Notizen</h2>
        {item.notes.trim() ? (
          <p class="notes">{item.notes}</p>
        ) : (
          <button type="button" class="notes-empty" onClick={() => push({ type: 'editor', itemId: id })}>
            Farben, Techniken, Umbauten notieren – damit du den nächsten Trupp genauso hinbekommst.
          </button>
        )}
      </section>

      {menu && (
        <Sheet title={title} onClose={() => setMenu(false)}>
          <SheetAction
            icon="edit"
            label="Bearbeiten"
            onClick={() => {
              setMenu(false);
              push({ type: 'editor', itemId: id });
            }}
          />
          {photos.length > 0 && (
            <SheetAction
              icon="share"
              label={photos.length === 1 ? 'Foto teilen' : `Alle ${photos.length} Fotos teilen`}
              onClick={() => {
                setMenu(false);
                void sharePhotos(
                  photos.map((p, i) => ({ file: p.file, name: photos.length > 1 ? `${title} ${i + 1}` : title })),
                  title,
                ).catch(() => undefined);
              }}
            />
          )}
          {armyUnit(item.ref) && cover && (
            <SheetAction
              icon="share"
              label="Als Einheitenfoto an simpleArmy"
              hint="Titelbild teilen – im Teilen-Menü simpleArmy wählen"
              onClick={() => {
                setMenu(false);
                // simpleArmy erkennt die Einheit am Text und ordnet das Foto ohne Nachfrage zu
                void sharePhotos([{ file: cover.file, name: title }], title, `simplearmy:unit=${armyUnit(item.ref)}`).catch(() => undefined);
              }}
            />
          )}
          <SheetAction icon="trash" label="In den Papierkorb" hint="30 Tage lang wiederherstellbar" tone="danger" onClick={trash} />
        </Sheet>
      )}
    </Page>
  );
}
