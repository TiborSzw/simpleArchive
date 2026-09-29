import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.tiborszw.simplearchive',
  appName: 'simpleArchive',
  webDir: 'dist',
  backgroundColor: '#100e0b',
  android: {
    backgroundColor: '#100e0b',
  },
  plugins: {
    SystemBars: {
      // Edge-to-edge on Android 15+: the web layer pads itself via env(safe-area-inset-*).
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
    SplashScreen: {
      launchShowDuration: 400,
      launchAutoHide: true,
      backgroundColor: '#100e0b',
      showSpinner: false,
    },
  },
};

export default config;
