import { useEffect, useRef, useState } from 'preact/hooks';
import { updateSettings } from '../../core/archive';
import { KIND_INFO, STATUS_INFO } from '../../core/constants';
import { monthLabel, nowLocal } from '../../core/dates';
import { coverOf, itemTitle, photosOf } from '../../core/query';
import { albumSupported, saveBlobToAlbum } from '../../native/gallery';
import { mediaUrl } from '../../native/media';
import { haptic } from '../../native/platform';
import { safeFileName, shareBlob } from '../../native/share';
import { Icon } from '../icons';
import { loadImage } from '../image';
import { CARD_STYLES, renderCard, type CardStyle } from '../showcase';
import { archive, createStore, mutate, toast, useStore } from '../store';
import { Chip, MediaImg, Page, Toggle } from './ui';

const lastStyle = createStore<CardStyle>('gallery');

export function Showcase({ itemId, photoId, beforeId }: { itemId: string; photoId?: string; beforeId?: string }) {
  const a = useStore(archive);
  const item = a.items.find((it) => it.id === itemId);
  const photos = photosOf(a, itemId);
  const [style, setStyle] = useState<CardStyle>(() => (beforeId ? 'compare' : lastStyle.get() === 'compare' && photos.length < 2 ? 'gallery' : lastStyle.get()));
  const [chosen, setChosen] = useState(() => photoId ?? (item ? coverOf(a, item)?.id : undefined) ?? photos[photos.length - 1]?.id);
  const [before, setBefore] = useState(() => beforeId ?? photos[0]?.id);
  const [showTags, setShowTags] = useState(true);
  const [signature, setSignature] = useState(true);
  const [name, setName] = useState(a.settings.painterName);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const renderId = useRef(0);

  const photo = photos.find((p) => p.id === chosen) ?? photos[photos.length - 1];
  const beforePhoto = photos.find((p) => p.id === before) ?? photos[0];

  const meta = item
    ? (showTags && item.tags.length ? item.tags.slice(0, 3) : [KIND_INFO[item.kind].name, item.models > 1 ? `${item.models} Modelle` : ''])
        .filter(Boolean)
        .join('  ·  ')
    : '';
  const when = item?.finishedAt ?? photo?.takenAt ?? nowLocal();
  const footer = [signature && name.trim() ? `bemalt von ${name.trim()}` : '', monthLabel(when.slice(0, 7))].filter(Boolean).join('  ·  ');

  useEffect(() => {
    if (!item || !photo) return;
    const id = ++renderId.current;
    setError(null);
    const t = setTimeout(async () => {
      try {
        const [img, bImg] = await Promise.all([
          mediaUrl(photo.file).then(loadImage),
          style === 'compare' && beforePhoto ? mediaUrl(beforePhoto.file).then(loadImage) : Promise.resolve(null),
        ]);
        const blob = await renderCard({
          style,
          photo: img,
          before: bImg,
          title: itemTitle(item),
          meta,
          footer,
          beforeLabel: beforePhoto ? (beforePhoto.stage === photo.stage ? 'Vorher' : STATUS_INFO[beforePhoto.stage].short) : 'Vorher',
          afterLabel: beforePhoto && beforePhoto.stage !== photo.stage ? STATUS_INFO[photo.stage].short : 'Nachher',
        });
        if (id !== renderId.current) return;
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { url: URL.createObjectURL(blob), blob };
        });
      } catch (e) {
        if (id === renderId.current) setError(e instanceof Error ? e.message : 'Karte konnte nicht erstellt werden.');
      }
    }, 120);
    return () => clearTimeout(t);
  }, [style, photo?.id, beforePhoto?.id, meta, footer, item?.name]);

  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), []);

  if (!item || !photo) return null;
  const title = itemTitle(item);

  const rememberName = () => {
    if (name.trim() !== a.settings.painterName) mutate((x, now) => updateSettings(x, { painterName: name.trim() }, now));
  };

  const share = async () => {
    if (!preview) return;
    rememberName();
    setWorking(true);
    try {
      await shareBlob(preview.blob, `${title} – simpleArchive`, title, `${title} – bemalt${name.trim() ? ` von ${name.trim()}` : ''}`);
    } catch {
      /* cancelled */
    } finally {
      setWorking(false);
    }
  };

  const toAlbum = async () => {
    if (!preview) return;
    rememberName();
    setWorking(true);
    try {
      await saveBlobToAlbum(preview.blob, a.settings.albumName, safeFileName(`${title} Showcase ${nowLocal().slice(0, 10)}`));
      haptic('success');
      toast({ text: `Karte im Album „${a.settings.albumName}“ gespeichert`, tone: 'good' });
    } catch (e) {
      toast({ text: 'Speichern im Album fehlgeschlagen', sub: e instanceof Error ? e.message : undefined, tone: 'bad' });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Page class="showcase" title="Showcase-Karte">
      <div class="card-preview">
        {preview ? <img src={preview.url} alt={`Showcase-Karte ${title}`} /> : <div class="card-preview-loading">{error ?? 'Karte wird gestaltet …'}</div>}
      </div>

      <div class="chip-wrap center">
        {CARD_STYLES.filter((s) => s.id !== 'compare' || photos.length > 1).map((s) => (
          <Chip
            key={s.id}
            active={style === s.id}
            onClick={() => {
              setStyle(s.id);
              lastStyle.set(s.id);
            }}
          >
            {s.name}
          </Chip>
        ))}
      </div>

      {photos.length > 1 && (
        <div class="field">
          <span>{style === 'compare' ? 'Nachher-Foto' : 'Foto'}</span>
          <div class="thumb-strip">
            {photos.map((p) => (
              <button type="button" key={p.id} class={`thumb ${p.id === photo.id ? 'is-after' : ''}`} onClick={() => setChosen(p.id)} aria-label="Foto wählen">
                <MediaImg name={p.thumb} />
              </button>
            ))}
          </div>
        </div>
      )}
      {style === 'compare' && (
        <div class="field">
          <span>Vorher-Foto</span>
          <div class="thumb-strip">
            {photos.map((p) => (
              <button type="button" key={p.id} class={`thumb ${p.id === beforePhoto?.id ? 'is-before' : ''}`} onClick={() => setBefore(p.id)} aria-label="Vorher-Foto wählen">
                <MediaImg name={p.thumb} />
              </button>
            ))}
          </div>
        </div>
      )}

      <label class="field">
        <span>Signatur</span>
        <input type="text" value={name} maxLength={40} placeholder="Dein Name oder Künstlername" onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={rememberName} />
      </label>
      <Toggle checked={signature} onChange={setSignature} label="„bemalt von …“ zeigen" disabled={!name.trim()} />
      <Toggle checked={showTags} onChange={setShowTags} label="Tags zeigen" hint={item.tags.length ? item.tags.slice(0, 3).join(', ') : 'Dieses Werk hat noch keine Tags.'} disabled={!item.tags.length} />

      <div class="showcase-buttons">
        {albumSupported && (
          <button type="button" class="btn ghost" onClick={() => void toAlbum()} disabled={!preview || working}>
            <Icon name="album" size={18} /> Ins Album
          </button>
        )}
        <button type="button" class="btn primary" onClick={() => void share()} disabled={!preview || working}>
          <Icon name="share" size={18} /> Teilen
        </button>
      </div>
    </Page>
  );
}
