import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/600.css';
import '@fontsource-variable/inter';
import './styles/theme.css';
import './styles/app.css';
import { render } from 'preact';
import { isNative, onAppPause, onAppResume, onBackButton, onConnectionChange } from './native/platform';
import { App } from './ui/App';
import { autoBackup, initCloud, scheduleAutoBackup } from './ui/cloud';
import { handleBackButton } from './ui/nav';
import { emergencySave, flushSave, initStorage, onArchiveChange } from './ui/store';

// Soft keyboard height (0 when the viewport already resizes for it) – sheets stay above it.
const vv = window.visualViewport;
if (vv) {
  const update = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', `${kb}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

async function boot() {
  try {
    await Promise.all([initStorage(), initCloud()]);
  } catch (e) {
    console.error('Start fehlgeschlagen', e);
  }
  render(<App />, document.getElementById('app')!);

  onBackButton(handleBackButton);
  onArchiveChange(() => scheduleAutoBackup());
  onAppPause(() => {
    void flushSave().then(() => autoBackup());
  });
  onAppResume(() => scheduleAutoBackup(5_000));
  window.addEventListener('pagehide', () => {
    emergencySave();
    void flushSave();
  });
  onConnectionChange((c) => {
    if (c === 'wifi') scheduleAutoBackup(10_000);
  });
  scheduleAutoBackup(15_000);
}

void boot();

// Ask the browser not to evict our photos under storage pressure.
navigator.storage?.persist?.().catch(() => undefined);

if ('serviceWorker' in navigator && import.meta.env.PROD && !isNative) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service Worker nicht registriert', err));
  });
}
