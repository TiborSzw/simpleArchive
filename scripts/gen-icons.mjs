// Renders the app icon (scripts/icon.svg) into every size the web app and the
// Android app need – with a headless Chromium, so the SVG gradients look exactly
// like in the browser.
//   npm run icons
// Needs Chromium: PLAYWRIGHT_CHROMIUM=/path/to/chrome (default: Playwright's cache).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'scripts/icon.svg'), 'utf8');
const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const defs = /<defs>[\s\S]*?<\/defs>/.exec(inner)[0];
const background = /<g id="background">[\s\S]*?<\/g>/.exec(inner)[0];
const foreground = /<g id="foreground">[\s\S]*?<\/g>/.exec(inner)[0];
const BG = '#100e0b';
const ADAPTIVE_BG = '#15120e';

/** SVG markup for one render. */
function art({ size, shape = 'square', bg = true, scale = 1, glowOnly = false }) {
  const s = 512;
  const t = (s * (1 - scale)) / 2;
  const clip =
    shape === 'round' ? `<clipPath id="c"><circle cx="256" cy="256" r="256"/></clipPath>` : shape === 'rounded' ? `<clipPath id="c"><rect width="512" height="512" rx="112"/></clipPath>` : '';
  const bgLayer = bg ? background : glowOnly ? '<rect width="512" height="512" fill="url(#glow)"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">${defs.replace('</defs>', `${clip}</defs>`)}<g ${clip ? 'clip-path="url(#c)"' : ''}>${bgLayer}<g transform="translate(${t} ${t}) scale(${scale})">${foreground}</g></g></svg>`;
}

function splashSvg(w, h) {
  const size = Math.round(Math.min(w, h) * 0.34);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}<rect width="${w}" height="${h}" fill="${BG}"/><g transform="translate(${(w - size) / 2} ${(h - size) / 2}) scale(${size / 512})"><rect width="512" height="512" fill="url(#glow)"/>${foreground}</g></svg>`;
}

const exe = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(markup, w, h, out) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${markup}</body></html>`);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  console.log('✓', out.replace(`${root}/`, ''), `${w}×${h}`);
}

// Web
const web = join(root, 'public/icons');
await render(art({ size: 192, shape: 'rounded' }), 192, 192, join(web, 'icon-192.png'));
await render(art({ size: 512, shape: 'rounded' }), 512, 512, join(web, 'icon-512.png'));
await render(art({ size: 512, scale: 0.8 }), 512, 512, join(web, 'icon-maskable-512.png'));
await render(art({ size: 180 }), 180, 180, join(web, 'apple-touch-icon.png'));
writeFileSync(join(web, 'favicon.svg'), art({ size: 64, shape: 'rounded' }));

// Android launcher icons
const res = join(root, 'android/app/src/main/res');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  const legacy = Math.round(48 * k);
  const adaptive = Math.round(108 * k);
  await render(art({ size: legacy, shape: 'rounded', scale: 1.06 }), legacy, legacy, join(res, `mipmap-${d}/ic_launcher.png`));
  await render(art({ size: legacy, shape: 'round', scale: 1.06 }), legacy, legacy, join(res, `mipmap-${d}/ic_launcher_round.png`));
  // Foreground layer: content inside the 66dp safe zone of the 108dp canvas.
  await render(art({ size: adaptive, bg: false, glowOnly: true, scale: 0.8 }), adaptive, adaptive, join(res, `mipmap-${d}/ic_launcher_foreground.png`));
}
writeFileSync(
  join(res, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${ADAPTIVE_BG}</color>\n</resources>\n`,
);

// Splash screens (same sizes as Capacitor's defaults)
const splashes = {
  'drawable/splash.png': [480, 320],
  'drawable-land-mdpi/splash.png': [480, 320],
  'drawable-land-hdpi/splash.png': [800, 480],
  'drawable-land-xhdpi/splash.png': [1280, 720],
  'drawable-land-xxhdpi/splash.png': [1600, 960],
  'drawable-land-xxxhdpi/splash.png': [1920, 1280],
  'drawable-port-mdpi/splash.png': [320, 480],
  'drawable-port-hdpi/splash.png': [480, 800],
  'drawable-port-xhdpi/splash.png': [720, 1280],
  'drawable-port-xxhdpi/splash.png': [960, 1600],
  'drawable-port-xxxhdpi/splash.png': [1280, 1920],
};
for (const [file, [w, h]] of Object.entries(splashes)) await render(splashSvg(w, h), w, h, join(res, file));

await browser.close();
