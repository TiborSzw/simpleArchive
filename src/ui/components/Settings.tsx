import { useMemo, useState } from 'preact/hooks';
import { addPhotos, createItem, deleteTag, purgeOne, purgeTrash, renameTag, restoreItem, restorePhoto, updateSettings } from '../../core/archive';
import { TRASH_DAYS } from '../../core/constants';
import { dateShort, daysBetween, nowLocal } from '../../core/dates';
import { itemTitle, livePhotos, tagIndex, trashEntries } from '../../core/query';
import { formatBytes } from '../../core/stats';
import type { ArchiveSettings, NewPhoto } from '../../core/types';
import { albumSupported } from '../../native/gallery';
import { removeMedia } from '../../native/media';
import { Icon } from '../icons';
import { copyAllToAlbum } from '../importer';
import { push } from '../nav';
import { archive, mutate, orphanPhotos, toast, useStore } from '../store';
import { BackupSection } from './Backup';
import { ConfirmButton, Dialog, Empty, MediaImg, Page, Section, Segmented, Toggle } from './ui';

const set = (patch: Partial<ArchiveSettings>) => mutate((x, now) => updateSettings(x, patch, now));

export function Settings() {
  const a = useStore(archive);
  const s = a.settings;
  const trash = useMemo(() => trashEntries(a), [a]);
  const tags = useMemo(() => tagIndex(a), [a]);
  const bytes = useMemo(() => livePhotos(a).reduce((sum, p) => sum + p.bytes, 0), [a]);
  const [orphans, setOrphans] = useState<string[]>(() => orphanPhotos());

  const rescue = () => {
    const photos: NewPhoto[] = orphans.map((file) => {
      const m = /^p_(\d{4}-\d{2}-\d{2})_/.exec(file);
      const thumb = file.replace(/^p_/, 't_');
      return { file, thumb, width: 0, height: 0, bytes: 0, takenAt: `${m?.[1] ?? nowLocal().slice(0, 10)}T12:00:00` };
    });
    mutate((x, now) => {
      const c = createItem(x, { name: 'Gerettete Fotos', status: 'done' }, now);
      return addPhotos(c.archive, c.item.id, photos, now).archive;
    });
    toast({ text: `${photos.length} Fotos gerettet`, sub: 'Im Werk „Gerettete Fotos“ – von dort aus neu zuordnen.', tone: 'good' }, 6000);
    setOrphans([]);
  };

  return (
    <div class="settings">
      <header class="tab-header">
        <div class="tab-heading">
          <h1 class="display">Einstellungen</h1>
        </div>
      </header>

      <Section title="Du">
        <label class="field">
          <span>Name für die Signatur</span>
          <input type="text" value={s.painterName} maxLength={40} placeholder="erscheint auf Showcase-Karten: „bemalt von …“" onChange={(e) => set({ painterName: (e.target as HTMLInputElement).value.trim() })} />
        </label>
      </Section>

      <Section title="Darstellung">
        <div class="field inline">
          <span>Farbschema</span>
          <Segmented
            label="Farbschema"
            value={s.theme}
            onChange={(v) => set({ theme: v })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'dark', label: 'Dunkel', icon: 'moon' },
              { value: 'light', label: 'Hell', icon: 'sun' },
            ]}
          />
        </div>
        <div class="field inline">
          <span>Spalten in der Vitrine</span>
          <Segmented
            label="Spalten"
            value={s.gridColumns}
            onChange={(v) => set({ gridColumns: v })}
            options={[
              { value: 2, label: '2' },
              { value: 3, label: '3' },
            ]}
          />
        </div>
      </Section>

      <Section title="Fotos">
        <div class="field">
          <span>Gespeicherte Größe</span>
          <Segmented
            label="Fotogröße"
            value={s.maxEdge}
            onChange={(v) => set({ maxEdge: v })}
            options={[
              { value: 2048, label: 'Kompakt' },
              { value: 3072, label: 'Standard' },
              { value: 4096, label: 'Maximal' },
            ]}
          />
          <small class="field-hint">
            Längste Kante {s.maxEdge} Pixel. Standard reicht für Zoom auf Details und hält Backups schlank. Aktuell {formatBytes(bytes)} Fotos.
          </small>
        </div>
        <Toggle checked={s.cameraChecklist} onChange={(v) => set({ cameraChecklist: v })} label="Foto-Checkliste vor der Kamera" hint="Licht, Hintergrund, Zoom – die 5 Punkte aus der Fotoschule" />
      </Section>

      <Section title="Handy-Album" hint={albumSupported ? `Neue Fotos landen zusätzlich in „Bilder/${s.albumName}“ und erscheinen so in Google Fotos & Co. Löschen in simpleArchive entfernt die Kopie im Album nicht.` : 'Nur in der Android-App.'}>
        <Toggle checked={s.albumEnabled} onChange={(v) => set({ albumEnabled: v })} label="Fotos auch ins Handy-Album" disabled={!albumSupported} />
        <label class="field">
          <span>Name des Albums</span>
          <input type="text" value={s.albumName} maxLength={40} onChange={(e) => set({ albumName: (e.target as HTMLInputElement).value.trim() || 'simpleArchive' })} disabled={!albumSupported} />
        </label>
        <button type="button" class="btn ghost small" onClick={() => void copyAllToAlbum()} disabled={!albumSupported}>
          <Icon name="album" size={16} /> Fehlende Fotos ins Album kopieren
        </button>
      </Section>

      <Section title="Backup">
        <BackupSection />
      </Section>

      <Section title="Aufräumen">
        <button type="button" class="list-link" onClick={() => push({ type: 'tags' })}>
          <Icon name="tag" />
          <span>
            Tags verwalten
            <small>{tags.length} Tags – umbenennen, zusammenlegen, löschen</small>
          </span>
          <Icon name="next" size={18} />
        </button>
        <button type="button" class="list-link" onClick={() => push({ type: 'trash' })}>
          <Icon name="trash" />
          <span>
            Papierkorb
            <small>{trash.length ? `${trash.length} Einträge – werden nach ${TRASH_DAYS} Tagen gelöscht` : 'leer'}</small>
          </span>
          <Icon name="next" size={18} />
        </button>
        {orphans.length > 0 && (
          <div class="banner">
            <p>
              <strong>{orphans.length} Fotos ohne Werk gefunden</strong> – z. B. nach einer Wiederherstellung. Sie liegen noch auf dem Handy.
            </p>
            <div class="banner-actions">
              <button type="button" class="btn primary small" onClick={rescue}>
                Retten
              </button>
              <ConfirmButton
                class="btn ghost small"
                confirmText="Endgültig löschen?"
                onConfirm={() => {
                  void removeMedia(orphans.flatMap((f) => [f, f.replace(/^p_/, 't_')]));
                  setOrphans([]);
                }}
              >
                Löschen
              </ConfirmButton>
            </div>
          </div>
        )}
      </Section>

      <Section title="Über">
        <button type="button" class="list-link" onClick={() => push({ type: 'about' })}>
          <Icon name="shield" />
          <span>
            simpleArchive {__APP_VERSION__}
            <small>werbefrei, ohne Konto, ohne Tracking – deine Fotos bleiben bei dir</small>
          </span>
          <Icon name="next" size={18} />
        </button>
      </Section>
    </div>
  );
}

export function Trash() {
  const a = useStore(archive);
  const entries = trashEntries(a);
  const now = nowLocal();
  const empty = () => {
    let files: string[] = [];
    mutate((x, n) => {
      const r = purgeTrash(x, n, true);
      files = r.files;
      return r.archive;
    });
    void removeMedia(files);
    toast({ text: 'Papierkorb geleert', tone: 'good' });
  };
  return (
    <Page
      title="Papierkorb"
      actions={
        entries.length > 0 && (
          <ConfirmButton class="btn ghost small" confirmText="Alles löschen?" onConfirm={empty}>
            Leeren
          </ConfirmButton>
        )
      }
    >
      {!entries.length ? (
        <Empty icon="trash" title="Der Papierkorb ist leer">
          Gelöschte Werke und Fotos bleiben hier {TRASH_DAYS} Tage lang, bevor sie endgültig verschwinden.
        </Empty>
      ) : (
        <div class="trash-list">
          {entries.map((e) => {
            const left = Math.max(0, TRASH_DAYS - daysBetween(e.deletedAt, now));
            const photo = e.photo ?? a.photos.find((p) => p.itemId === e.item.id);
            return (
              <div class="trash-row" key={`${e.kind}-${e.id}`}>
                {photo ? <MediaImg name={photo.thumb} class="trash-thumb" /> : <span class="trash-thumb placeholder" />}
                <div class="trash-text">
                  <strong>{e.kind === 'item' ? itemTitle(e.item) : `Foto aus „${itemTitle(e.item)}“`}</strong>
                  <small>
                    gelöscht {dateShort(e.deletedAt)} · noch {left} {left === 1 ? 'Tag' : 'Tage'}
                  </small>
                </div>
                <button
                  type="button"
                  class="btn ghost small"
                  onClick={() => mutate((x, n) => (e.kind === 'item' ? restoreItem(x, e.id, n) : restorePhoto(x, e.id, n)))}
                >
                  <Icon name="restore" size={16} /> Zurück
                </button>
                <ConfirmButton
                  class="icon-btn danger"
                  confirmText={<Icon name="check" size={18} />}
                  onConfirm={() => {
                    let files: string[] = [];
                    mutate((x, n) => {
                      const r = purgeOne(x, e.kind, e.id, n);
                      files = r.files;
                      return r.archive;
                    });
                    void removeMedia(files);
                  }}
                >
                  <Icon name="trash" size={18} />
                </ConfirmButton>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}

export function TagManager() {
  const a = useStore(archive);
  const tags = tagIndex(a);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  return (
    <Page title="Tags verwalten">
      {!tags.length ? (
        <Empty icon="tag" title="Noch keine Tags">
          Tags vergibst du beim Bearbeiten eines Werks – z. B. System, Fraktion oder Technik.
        </Empty>
      ) : (
        <div class="tag-list">
          {tags.map((t) => (
            <div class="tag-row" key={t.tag}>
              <Icon name="tag" size={18} />
              <span class="tag-name">{t.tag}</span>
              <span class="muted small">
                {t.count} {t.count === 1 ? 'Werk' : 'Werke'}
              </span>
              <button
                type="button"
                class="icon-btn"
                aria-label={`${t.tag} umbenennen`}
                onClick={() => {
                  setEditing(t.tag);
                  setValue(t.tag);
                }}
              >
                <Icon name="edit" size={18} />
              </button>
              <ConfirmButton class="icon-btn danger" confirmText={<Icon name="check" size={18} />} onConfirm={() => mutate((x, n) => deleteTag(x, t.tag, n))}>
                <Icon name="trash" size={18} />
              </ConfirmButton>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <Dialog title={`„${editing}“ umbenennen`} onClose={() => setEditing(null)}>
          <label class="field">
            <span>Neuer Name</span>
            <input type="text" value={value} autoFocus onInput={(e) => setValue((e.target as HTMLInputElement).value)} />
            <small class="field-hint">Heißt ein anderer Tag schon so, werden beide zusammengelegt.</small>
          </label>
          <div class="dialog-buttons">
            <button type="button" class="btn ghost" onClick={() => setEditing(null)}>
              Abbrechen
            </button>
            <button
              type="button"
              class="btn primary"
              onClick={() => {
                mutate((x, n) => renameTag(x, editing, value, n));
                setEditing(null);
              }}
            >
              Speichern
            </button>
          </div>
        </Dialog>
      )}
    </Page>
  );
}

export function About() {
  return (
    <Page title="Über simpleArchive" class="about">
      <div class="about-hero">
        <img src="./icons/icon-192.png" alt="" width={88} height={88} />
        <h1 class="display">simpleArchive</h1>
        <p class="muted">Version {__APP_VERSION__}</p>
      </div>
      <Section title="Deine Daten">
        <ul class="plain-list">
          <li>Alle Fotos und Notizen liegen auf deinem Handy. Kein Konto, kein Server, kein Tracking, keine Werbung.</li>
          <li>Backups gehen nur dorthin, wo du es einstellst: deine Nextcloud, dein Google Drive oder eine ZIP-Datei.</li>
          <li>Beim Speichern wird jedes Foto neu kodiert – dabei fallen Metadaten wie der GPS-Ort weg. Geteilte Bilder verraten nicht, wo dein Hobbyraum ist.</li>
          <li>Google Drive: Die App bekommt nur Zugriff auf Dateien, die sie selbst angelegt hat (Berechtigung „drive.file“).</li>
        </ul>
      </Section>
      <Section title="Teil der simple-Apps">
        <p class="muted">Werbefreie Apps für den eigenen Gebrauch – wie simpleColour (Farben & Rezepte) und simpleArmy (Warhammer-Sammlung).</p>
      </Section>
    </Page>
  );
}
