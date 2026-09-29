import { useEffect, useState } from 'preact/hooks';
import { updateSettings } from '../core/archive';
import { setSystemBarsLight } from '../native/platform';
import { Backdrop } from './components/Backdrop';
import { Collection } from './components/Collection';
import { Compare } from './components/Compare';
import { Editor } from './components/Editor';
import { Gallery } from './components/Gallery';
import { ItemPage } from './components/ItemPage';
import { PhotoViewer } from './components/PhotoViewer';
import { LessonPage, School } from './components/School';
import { About, Settings, TagManager, Trash } from './components/Settings';
import { SheetHost } from './components/Sheets';
import { Showcase } from './components/Showcase';
import { Icon, type IconName } from './icons';
import { goBack, nav, openSheet, setTab, type Screen, type Tab } from './nav';
import { archive, busy, dismissToast, isFresh, mutate, saveError, toasts, useStore } from './store';

function renderScreen(s: Screen) {
  switch (s.type) {
    case 'item':
      return <ItemPage id={s.id} />;
    case 'viewer':
      return <PhotoViewer photoIds={s.photoIds} index={s.index} />;
    case 'editor':
      return <Editor itemId={s.itemId} photos={s.photos} status={s.status} />;
    case 'compare':
      return <Compare itemId={s.itemId} />;
    case 'showcase':
      return <Showcase itemId={s.itemId} photoId={s.photoId} beforeId={s.beforeId} />;
    case 'lesson':
      return <LessonPage id={s.id} />;
    case 'trash':
      return <Trash />;
    case 'tags':
      return <TagManager />;
    case 'about':
      return <About />;
  }
}

const screenKey = (s: Screen, i: number) => `${i}-${s.type}-${'id' in s ? s.id : 'itemId' in s ? s.itemId : ''}`;

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'gallery', label: 'Vitrine', icon: 'grid' },
  { id: 'collection', label: 'Sammlung', icon: 'chart' },
  { id: 'school', label: 'Fotoschule', icon: 'book' },
  { id: 'settings', label: 'Einstellungen', icon: 'gear' },
];

function BottomNav({ tab }: { tab: Tab }) {
  const tabButton = (t: (typeof TABS)[number]) => (
    <button type="button" key={t.id} class={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
      <Icon name={t.icon} />
      <span>{t.label}</span>
    </button>
  );
  return (
    <nav class="bottom-nav" aria-label="Hauptnavigation">
      {TABS.slice(0, 2).map(tabButton)}
      <button type="button" class="fab" aria-label="Hinzufügen" onClick={() => openSheet({ type: 'add', itemId: null })}>
        <Icon name="plus" size={28} />
      </button>
      {TABS.slice(2).map(tabButton)}
    </nav>
  );
}

function Toasts() {
  const list = useStore(toasts);
  return (
    <div class="toasts" aria-live="polite">
      {list.map((t) => (
        <div class={`toast toast-${t.tone ?? 'info'}`} key={t.id} role="status">
          <div class="toast-text">
            <strong>{t.text}</strong>
            {t.sub && <small>{t.sub}</small>}
          </div>
          {t.action && (
            <button
              type="button"
              class="toast-action"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function BusyOverlay() {
  const b = useStore(busy);
  if (!b) return null;
  const pct = b.total ? Math.round(((b.done ?? 0) / b.total) * 100) : null;
  return (
    <div class="busy" role="alertdialog" aria-busy="true" aria-label={b.title}>
      <div class="busy-card">
        <div class="spinner" aria-hidden="true" />
        <strong>{b.title}</strong>
        {b.detail && <small>{b.detail}</small>}
        {b.total ? (
          <>
            <div class="meter">
              <i style={{ width: `${pct}%` }} />
            </div>
            <small>
              {b.done ?? 0} / {b.total}
            </small>
          </>
        ) : null}
        {b.cancel && (
          <button type="button" class="btn ghost small" onClick={b.cancel}>
            Abbrechen
          </button>
        )}
      </div>
    </div>
  );
}

function Welcome() {
  const [name, setName] = useState('');
  const done = (then?: () => void) => {
    mutate((x, now) => updateSettings(x, { painterName: name.trim() }, now));
    isFresh.set(false);
    then?.();
  };
  return (
    <div class="welcome" role="dialog" aria-modal="true" aria-label="Willkommen">
      <Backdrop />
      <div class="welcome-card">
        <img src="./icons/icon-192.png" alt="" width={84} height={84} class="welcome-logo" />
        <h1 class="display">simpleArchive</h1>
        <p class="welcome-claim">Die Vitrine für deine bemalten Miniaturen und dein Terrain.</p>
        <ul class="welcome-list">
          <li>
            <Icon name="camera" size={20} /> Fotos mit Tags, Favoriten und Fortschritt – vom Gussrahmen bis zur Vitrine
          </li>
          <li>
            <Icon name="frame" size={20} /> Showcase-Karten und Vorher/Nachher zum Teilen
          </li>
          <li>
            <Icon name="cloud" size={20} /> Eigenes Handy-Album, Backup in Nextcloud oder Google Drive
          </li>
          <li>
            <Icon name="shield" size={20} /> Werbefrei, ohne Konto – alles bleibt bei dir
          </li>
        </ul>
        <label class="field">
          <span>Wie heißt du? (für „bemalt von …“)</span>
          <input type="text" value={name} maxLength={40} placeholder="optional" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </label>
        <button type="button" class="btn primary wide" onClick={() => done()}>
          Los geht's
        </button>
        <button type="button" class="link-btn center" onClick={() => done(() => setTab('settings'))}>
          Ich habe schon ein Backup
        </button>
      </div>
    </div>
  );
}

function useTheme() {
  const a = useStore(archive);
  const setting = a.settings.theme;
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const light = setting === 'light' || (setting === 'auto' && mq.matches);
      document.documentElement.dataset.theme = light ? 'light' : 'dark';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f6f2ea' : '#100e0b');
      setSystemBarsLight(light);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [setting]);
}

export function App() {
  const n = useStore(nav);
  const fresh = useStore(isFresh);
  const err = useStore(saveError);
  useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const top = n.stack.length - 1;
  return (
    <div class={`app ${top >= 0 ? 'has-layer' : ''}`}>
      <main class={`tab-content ${top >= 0 ? 'covered' : ''}`} aria-hidden={top >= 0 ? 'true' : undefined}>
        {n.tab === 'gallery' && <Gallery />}
        {n.tab === 'collection' && <Collection />}
        {n.tab === 'school' && <School />}
        {n.tab === 'settings' && <Settings />}
      </main>
      {top < 0 && <BottomNav tab={n.tab} />}
      {n.stack.map((s, i) => (
        <div class={`layer ${i < top ? 'covered' : ''} layer-${s.type}`} key={screenKey(s, i)} aria-hidden={i < top ? 'true' : undefined}>
          {renderScreen(s)}
        </div>
      ))}
      {err && (
        <div class="save-error" role="alert">
          Speichern fehlgeschlagen: {err}
        </div>
      )}
      <SheetHost sheet={n.sheet} />
      <Toasts />
      <BusyOverlay />
      {fresh && <Welcome />}
    </div>
  );
}
