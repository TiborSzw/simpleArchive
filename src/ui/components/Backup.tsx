import { useEffect, useState } from 'preact/hooks';
import { dateLabel, dateShort, nowLocal, relativeLabel } from '../../core/dates';
import type { Archive } from '../../core/types';
import { formatBytes } from '../../core/stats';
import type { RemoteSummary, RestorePoint } from '../../sync/sync';
import { zipSupported } from '../../native/zip';
import {
  TARGET_LABEL,
  applyImportedArchive,
  backupNow,
  cancelCloud,
  cloud,
  cloudSettings,
  cloudWorksHere,
  connectDrive,
  disconnectDrive,
  disconnectNextcloud,
  driveSupported,
  exportArchiveZip,
  inspect,
  isBackedUp,
  nextcloudConfigured,
  readArchiveZip,
  restoreFrom,
  restorePoints,
  saveCloudSettings,
  type CloudSettings,
  type TargetId,
} from '../cloud';
import { Icon } from '../icons';
import { archive, toast, useStore } from '../store';
import { ConfirmButton, Dialog, Toggle } from './ui';

const PHASE: Record<string, string> = { check: 'Prüfe Server …', upload: 'Lade hoch', meta: 'Speichere Archiv …', cleanup: 'Räume auf …', download: 'Lade herunter' };

function Progress() {
  const c = useStore(cloud);
  if (!c.busy || !c.progress) return null;
  const p = c.progress;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : null;
  return (
    <div class="sync-progress">
      <div class="sync-progress-text">
        <span>
          {PHASE[p.phase]} {p.total ? `${p.done}/${p.total}` : ''}
        </span>
        <button type="button" class="link-btn" onClick={cancelCloud}>
          Abbrechen
        </button>
      </div>
      <div class="meter">
        <i style={{ width: pct === null ? '30%' : `${pct}%` }} class={pct === null ? 'indeterminate' : ''} />
      </div>
    </div>
  );
}

function StatusLine({ t }: { t: TargetId }) {
  const c = useStore(cloud);
  useStore(archive);
  const st = c.status[t];
  if (c.busy === t) return <Progress />;
  const now = nowLocal();
  return (
    <div class="sync-status">
      {st.lastError && (!st.lastSuccessAt || (st.lastErrorAt ?? '') > st.lastSuccessAt) ? (
        <p class="bad">
          <Icon name="info" size={16} /> {st.lastError}
        </p>
      ) : st.lastSuccessAt ? (
        <p class={isBackedUp(t) ? 'good' : ''}>
          <Icon name={isBackedUp(t) ? 'check' : 'clock'} size={16} />
          {isBackedUp(t) ? 'Alles gesichert' : 'Änderungen noch nicht gesichert'} · letztes Backup {relativeLabel(st.lastSuccessAt, now)} ({st.lastSuccessAt.slice(11, 16)})
        </p>
      ) : (
        <p class="muted">Noch kein Backup.</p>
      )}
    </div>
  );
}

/** The backup folder belongs to another archive (typically: new phone, not restored yet). */
function ForeignBanner({ t, remote, onRestore }: { t: TargetId; remote: RemoteSummary; onRestore: () => void }) {
  const a = useStore(archive);
  const localCount = a.items.filter((it) => !it.deletedAt).length;
  return (
    <div class="banner">
      <p>
        <strong>In {TARGET_LABEL[t]} liegt schon ein Archiv</strong> – {remote.items} Werke, {remote.photos} Fotos, Stand {dateShort(remote.updatedAt)}. Automatische Backups sind pausiert, damit nichts überschrieben wird.
      </p>
      <div class="banner-actions">
        <button type="button" class="btn primary small" onClick={onRestore}>
          <Icon name="restore" size={16} /> Wiederherstellen
        </button>
        <ConfirmButton class="btn ghost small" confirmText={localCount ? `Ja, mit ${localCount} Werken überschreiben` : 'Ja, überschreiben'} onConfirm={() => void backupNow(t, 'manual', true)}>
          Mit diesem Handy überschreiben
        </ConfirmButton>
      </div>
    </div>
  );
}

function RestoreDialog({ t, onClose }: { t: TargetId; onClose: () => void }) {
  const [points, setPoints] = useState<RestorePoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const a = useStore(archive);
  const local = a.items.filter((it) => !it.deletedAt).length;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    restorePoints(t)
      .then((p) => alive && setPoints(p))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Backups konnten nicht gelesen werden.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [t]);

  return (
    <Dialog title={`Wiederherstellen aus ${TARGET_LABEL[t]}`} onClose={onClose}>
      {local > 0 && <p class="warn-text">Achtung: Das ersetzt dein aktuelles Archiv ({local} Werke) auf diesem Handy. Fotos, die im Backup fehlen, bleiben als „verwaiste Fotos“ erhalten.</p>}
      {loading && <p class="muted">Lade Liste …</p>}
      {error && <p class="bad">{error}</p>}
      {points && !points.length && <p class="muted">In diesem Ordner liegt noch kein Backup.</p>}
      {points && points.length > 0 && (
        <div class="restore-list">
          {points.map((p) => (
            <button
              type="button"
              class="restore-point"
              key={`${p.dir}/${p.name}`}
              onClick={() => {
                onClose();
                void restoreFrom(t, p);
              }}
            >
              <strong>{p.day ? dateLabel(`${p.day}T12:00:00`) : 'Neuester Stand'}</strong>
              <small>{p.day ? 'Tagesstand' : 'archive.json'} · {formatBytes(p.size)}</small>
            </button>
          ))}
        </div>
      )}
      <div class="dialog-buttons">
        <button type="button" class="btn ghost" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </Dialog>
  );
}

function NextcloudCard() {
  const s = useStore(cloudSettings);
  const c = useStore(cloud);
  const [form, setForm] = useState(s.nextcloud);
  const [editing, setEditing] = useState(!nextcloudConfigured(s));
  const [testing, setTesting] = useState(false);
  const [restore, setRestore] = useState(false);
  const status = c.status.nextcloud;

  const test = async () => {
    setTesting(true);
    const next: CloudSettings = { ...s, nextcloud: { ...form, enabled: true } };
    try {
      const remote = await inspect('nextcloud', next);
      saveCloudSettings({ nextcloud: next.nextcloud });
      setEditing(false);
      if (remote && remote.id !== archive.get().id && remote.items > 0) {
        cloud.set((x) => ({ ...x, status: { ...x.status, nextcloud: { ...x.status.nextcloud, foreign: remote } } }));
        toast({ text: 'Verbunden – dort liegt schon ein Archiv', sub: `${remote.items} Werke, ${remote.photos} Fotos`, tone: 'info' }, 6000);
      } else {
        toast({ text: 'Nextcloud verbunden', sub: remote ? 'Backup-Ordner gefunden.' : `Ordner „${form.folder}“ ist bereit.`, tone: 'good' });
        void backupNow('nextcloud', 'manual');
      }
    } catch (e) {
      toast({ text: 'Verbindung fehlgeschlagen', sub: e instanceof Error ? e.message : undefined, tone: 'bad' }, 7000);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div class="backup-card">
      <div class="backup-head">
        <span class="backup-icon">
          <Icon name="cloud" />
        </span>
        <div>
          <strong>Nextcloud</strong>
          <small>{nextcloudConfigured(s) && s.nextcloud.enabled ? `${s.nextcloud.user} · ${s.nextcloud.url.replace(/^https?:\/\//, '')}/${s.nextcloud.folder}` : 'eigene Cloud per WebDAV'}</small>
        </div>
      </div>
      {editing ? (
        <form
          class="backup-form"
          onSubmit={(e) => {
            e.preventDefault();
            void test();
          }}
        >
          <label class="field">
            <span>Adresse</span>
            <input type="url" inputMode="url" autoComplete="url" placeholder="https://cloud.example.com" value={form.url} onInput={(e) => setForm({ ...form, url: (e.target as HTMLInputElement).value })} required />
          </label>
          <label class="field">
            <span>Benutzername</span>
            <input type="text" autoComplete="username" autoCapitalize="off" value={form.user} onInput={(e) => setForm({ ...form, user: (e.target as HTMLInputElement).value })} required />
          </label>
          <label class="field">
            <span>App-Passwort</span>
            <input type="password" autoComplete="current-password" value={form.password} onInput={(e) => setForm({ ...form, password: (e.target as HTMLInputElement).value })} required />
            <small class="field-hint">In der Nextcloud: Persönliche Einstellungen → Sicherheit → „Neues App-Passwort erstellen“. Nie dein echtes Passwort.</small>
          </label>
          <label class="field">
            <span>Ordner</span>
            <input type="text" value={form.folder} onInput={(e) => setForm({ ...form, folder: (e.target as HTMLInputElement).value })} required />
          </label>
          <div class="form-buttons">
            {nextcloudConfigured(s) && (
              <button type="button" class="btn ghost" onClick={() => setEditing(false)}>
                Abbrechen
              </button>
            )}
            <button type="submit" class="btn primary" disabled={testing || !cloudWorksHere}>
              {testing ? 'Prüfe …' : 'Verbinden'}
            </button>
          </div>
        </form>
      ) : (
        <>
          {status.foreign ? <ForeignBanner t="nextcloud" remote={status.foreign} onRestore={() => setRestore(true)} /> : <StatusLine t="nextcloud" />}
          <div class="backup-actions">
            <button type="button" class="btn primary small" onClick={() => void backupNow('nextcloud', 'manual')} disabled={!!c.busy || !!status.foreign}>
              <Icon name="cloudUp" size={16} /> Jetzt sichern
            </button>
            <button type="button" class="btn ghost small" onClick={() => setRestore(true)} disabled={!!c.busy}>
              <Icon name="restore" size={16} /> Wiederherstellen
            </button>
            <button type="button" class="btn ghost small" onClick={() => setEditing(true)}>
              <Icon name="edit" size={16} /> Ändern
            </button>
            <ConfirmButton class="btn ghost small" confirmText="Trennen?" onConfirm={disconnectNextcloud}>
              Trennen
            </ConfirmButton>
          </div>
        </>
      )}
      {restore && <RestoreDialog t="nextcloud" onClose={() => setRestore(false)} />}
    </div>
  );
}

function DriveCard() {
  const s = useStore(cloudSettings);
  const c = useStore(cloud);
  const [connecting, setConnecting] = useState(false);
  const [restore, setRestore] = useState(false);
  const status = c.status.gdrive;

  const connect = async () => {
    setConnecting(true);
    try {
      const email = await connectDrive();
      const remote = await inspect('gdrive');
      if (remote && remote.id !== archive.get().id && remote.items > 0) {
        cloud.set((x) => ({ ...x, status: { ...x.status, gdrive: { ...x.status.gdrive, foreign: remote } } }));
        toast({ text: 'Verbunden – dort liegt schon ein Archiv', sub: `${remote.items} Werke, ${remote.photos} Fotos`, tone: 'info' }, 6000);
      } else {
        toast({ text: 'Google Drive verbunden', sub: email ?? undefined, tone: 'good' });
        void backupNow('gdrive', 'manual');
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'CANCELLED') toast({ text: 'Google Drive nicht verbunden', sub: e instanceof Error ? e.message : undefined, tone: 'bad' }, 9000);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div class="backup-card">
      <div class="backup-head">
        <span class="backup-icon">
          <Icon name="cloud" />
        </span>
        <div>
          <strong>Google Drive</strong>
          <small>{s.gdrive.enabled ? `${s.gdrive.email ?? 'verbunden'} · Meine Ablage/${s.gdrive.folder}` : 'sieht nur die eigenen simpleArchive-Dateien'}</small>
        </div>
      </div>
      {!s.gdrive.enabled ? (
        <>
          <p class="muted small">Automatische Sicherung in einen Ordner „{s.gdrive.folder}“ in deinem Drive. Die App bekommt nur Zugriff auf Dateien, die sie selbst anlegt.</p>
          <div class="backup-actions">
            <button type="button" class="btn primary small" onClick={() => void connect()} disabled={connecting || !driveSupported}>
              {connecting ? 'Verbinde …' : 'Mit Google verbinden'}
            </button>
          </div>
          {!driveSupported && <p class="muted small">Nur in der Android-App.</p>}
        </>
      ) : (
        <>
          {status.foreign ? <ForeignBanner t="gdrive" remote={status.foreign} onRestore={() => setRestore(true)} /> : <StatusLine t="gdrive" />}
          <div class="backup-actions">
            <button type="button" class="btn primary small" onClick={() => void backupNow('gdrive', 'manual')} disabled={!!c.busy || !!status.foreign}>
              <Icon name="cloudUp" size={16} /> Jetzt sichern
            </button>
            <button type="button" class="btn ghost small" onClick={() => setRestore(true)} disabled={!!c.busy}>
              <Icon name="restore" size={16} /> Wiederherstellen
            </button>
            <ConfirmButton class="btn ghost small" confirmText="Trennen?" onConfirm={() => void disconnectDrive()}>
              Trennen
            </ConfirmButton>
          </div>
        </>
      )}
      {restore && <RestoreDialog t="gdrive" onClose={() => setRestore(false)} />}
    </div>
  );
}

function ZipCard() {
  const [pending, setPending] = useState<Archive | null>(null);
  const a = useStore(archive);
  const local = a.items.filter((it) => !it.deletedAt).length;
  return (
    <div class="backup-card">
      <div class="backup-head">
        <span class="backup-icon">
          <Icon name="archive" />
        </span>
        <div>
          <strong>Als ZIP speichern</strong>
          <small>ohne Einrichtung – z. B. nach Google Drive, auf USB-Stick oder in Downloads</small>
        </div>
      </div>
      <div class="backup-actions">
        <button type="button" class="btn primary small" onClick={() => void exportArchiveZip()} disabled={!zipSupported || !local}>
          <Icon name="download" size={16} /> Exportieren
        </button>
        <button
          type="button"
          class="btn ghost small"
          onClick={async () => {
            const imported = await readArchiveZip();
            if (!imported) return;
            if (!local) applyImportedArchive(imported);
            else setPending(imported);
          }}
          disabled={!zipSupported}
        >
          <Icon name="upload" size={16} /> Importieren
        </button>
      </div>
      {!zipSupported && <p class="muted small">Nur in der Android-App.</p>}
      {pending && (
        <Dialog title="ZIP importieren?" onClose={() => setPending(null)}>
          <p>
            Das ZIP enthält {pending.items.filter((it) => !it.deletedAt).length} Werke und {pending.photos.length} Fotos. Es ersetzt dein aktuelles Archiv ({local} Werke).
          </p>
          <div class="dialog-buttons">
            <button type="button" class="btn ghost" onClick={() => setPending(null)}>
              Abbrechen
            </button>
            <button
              type="button"
              class="btn danger"
              onClick={() => {
                applyImportedArchive(pending);
                setPending(null);
              }}
            >
              Ersetzen
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export function BackupSection() {
  const s = useStore(cloudSettings);
  return (
    <div class="backup">
      {!cloudWorksHere && <p class="banner small">Backups laufen in der Android-App. In der Browser-Version liegen die Daten nur in diesem Browser.</p>}
      <NextcloudCard />
      <DriveCard />
      <Toggle checked={s.auto} onChange={(v) => saveCloudSettings({ auto: v })} label="Automatisch sichern" hint="nach Änderungen und beim Verlassen der App – nur neue Fotos werden hochgeladen" />
      <Toggle checked={s.wifiOnly} onChange={(v) => saveCloudSettings({ wifiOnly: v })} label="Nur im WLAN" hint="„Jetzt sichern“ geht trotzdem immer" disabled={!s.auto} />
      <ZipCard />
    </div>
  );
}
