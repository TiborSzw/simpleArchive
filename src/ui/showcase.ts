// Renders "showcase cards": a finished photo framed like an exhibition piece,
// with title, tags and signature – ready for Instagram, Discord or the club chat.
import { toJpeg } from './image';

export type CardStyle = 'gallery' | 'museum' | 'pure' | 'compare';

export const CARD_STYLES: { id: CardStyle; name: string }[] = [
  { id: 'gallery', name: 'Galerie' },
  { id: 'museum', name: 'Museum' },
  { id: 'pure', name: 'Vollbild' },
  { id: 'compare', name: 'Vorher/Nachher' },
];

export interface CardInput {
  style: CardStyle;
  photo: HTMLImageElement;
  before?: HTMLImageElement | null;
  title: string;
  /** e.g. "Warhammer 40k · Space Marines · NMM" */
  meta: string;
  /** e.g. "bemalt von Tibor · September 2026" */
  footer: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export const CARD_W = 1440;
export const CARD_H = 1800;

const DISPLAY = '"Cinzel", "Times New Roman", serif';
const SANS = '"Inter Variable", "Inter", system-ui, sans-serif';

export async function loadCardFonts(): Promise<void> {
  try {
    await Promise.all([document.fonts.load(`600 80px ${DISPLAY}`), document.fonts.load(`400 34px ${SANS}`), document.fonts.load(`600 30px ${SANS}`)]);
  } catch {
    /* system fonts will do */
  }
}

function spacing(ctx: CanvasRenderingContext2D, px: number) {
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** Largest font size (down to `min`) at which the text fits; ellipsis if even that is too wide. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, min: number, font: (s: number) => string): { text: string; size: number } {
  let s = size;
  ctx.font = font(s);
  while (s > min && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = font(s);
  }
  if (ctx.measureText(text).width <= maxWidth) return { text, size: s };
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return { text: `${t.trimEnd()}…`, size: s };
}

/** Fits an image into a box (contain) and returns the drawn rectangle. */
function containRect(img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const r = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * r;
  const dh = img.naturalHeight * r;
  return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
}

/** Draws an image cropped to fill the box (cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, focusY = 0.45) {
  const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / r;
  const sh = h / r;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = Math.max(0, Math.min(img.naturalHeight - sh, (img.naturalHeight - sh) * focusY));
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function ornament(ctx: CanvasRenderingContext2D, cx: number, y: number, width: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - width / 2, y);
  ctx.lineTo(cx - 16, y);
  ctx.moveTo(cx + 16, y);
  ctx.lineTo(cx + width / 2, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, y - 8);
  ctx.lineTo(cx + 8, y);
  ctx.lineTo(cx, y + 8);
  ctx.lineTo(cx - 8, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function brand(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, align: CanvasTextAlign = 'right') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `600 22px ${SANS}`;
  spacing(ctx, 6);
  ctx.textAlign = align;
  ctx.fillText('SIMPLEARCHIVE', x, y);
  ctx.restore();
}

function centerText(ctx: CanvasRenderingContext2D, text: string, y: number, maxWidth: number, size: number, min: number, font: (s: number) => string, color: string, letter = 0) {
  if (!text) return;
  ctx.save();
  spacing(ctx, letter);
  const fit = fitText(ctx, text, maxWidth, size, min, font);
  ctx.font = font(fit.size);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(fit.text, CARD_W / 2, y);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function drawGallery(ctx: CanvasRenderingContext2D, c: CardInput) {
  const bg = ctx.createRadialGradient(CARD_W / 2, CARD_H * 0.38, 100, CARD_W / 2, CARD_H * 0.45, CARD_H * 0.8);
  bg.addColorStop(0, '#2a241d');
  bg.addColorStop(1, '#0d0b09');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const box = containRect(c.photo, 150, 120, CARD_W - 300, 1230);
  // mat + gold line
  ctx.fillStyle = '#0a0907';
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fillRect(box.x - 34, box.y - 34, box.w + 68, box.h + 68);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#c99a45';
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x - 18, box.y - 18, box.w + 36, box.h + 36);
  ctx.drawImage(c.photo, box.x, box.y, box.w, box.h);

  const top = Math.max(box.y + box.h + 150, 1400);
  centerText(ctx, c.title, top, CARD_W - 220, 84, 44, (s) => `600 ${s}px ${DISPLAY}`, '#f3e7cf', 2);
  ornament(ctx, CARD_W / 2, top + 50, 420, '#c99a45');
  centerText(ctx, c.meta, top + 120, CARD_W - 260, 34, 24, (s) => `400 ${s}px ${SANS}`, '#b9ad99');
  centerText(ctx, c.footer, CARD_H - 96, CARD_W - 300, 28, 20, (s) => `400 ${s}px ${SANS}`, '#8d8272');
  brand(ctx, '#6f6556', CARD_W / 2, CARD_H - 44, 'center');
}

function drawMuseum(ctx: CanvasRenderingContext2D, c: CardInput) {
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, '#f1ece3');
  bg.addColorStop(1, '#e4ddd0');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const box = containRect(c.photo, 210, 150, CARD_W - 420, 1130);
  const pad = 70;
  ctx.fillStyle = '#fbf9f5';
  ctx.shadowColor = 'rgba(60,45,25,.28)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 26;
  ctx.fillRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#d9d1c4';
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6);
  ctx.drawImage(c.photo, box.x, box.y, box.w, box.h);

  // exhibition label
  const labelTop = Math.max(box.y + box.h + pad + 90, 1420);
  const lw = 880;
  const lx = (CARD_W - lw) / 2;
  ctx.fillStyle = '#fbf9f5';
  ctx.shadowColor = 'rgba(60,45,25,.18)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  ctx.fillRect(lx, labelTop, lw, 240);
  ctx.shadowColor = 'transparent';
  centerText(ctx, c.title, labelTop + 92, lw - 80, 62, 36, (s) => `600 ${s}px ${DISPLAY}`, '#2b241b', 1);
  centerText(ctx, c.meta, labelTop + 150, lw - 80, 30, 22, (s) => `400 ${s}px ${SANS}`, '#6d6254');
  centerText(ctx, c.footer, labelTop + 200, lw - 80, 26, 20, (s) => `italic 400 ${s}px ${SANS}`, '#8a7f70');
  brand(ctx, '#a39886', CARD_W - 60, CARD_H - 50);
}

function drawPure(ctx: CanvasRenderingContext2D, c: CardInput) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  drawCover(ctx, c.photo, 0, 0, CARD_W, CARD_H);
  const g = ctx.createLinearGradient(0, CARD_H * 0.55, 0, CARD_H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.82)');
  ctx.fillStyle = g;
  ctx.fillRect(0, CARD_H * 0.55, CARD_W, CARD_H * 0.45);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.6)';
  ctx.shadowBlur = 18;
  centerText(ctx, c.title, CARD_H - 250, CARD_W - 200, 88, 46, (s) => `600 ${s}px ${DISPLAY}`, '#fff', 2);
  ctx.restore();
  ornament(ctx, CARD_W / 2, CARD_H - 200, 360, 'rgba(233,196,122,.95)');
  centerText(ctx, c.meta, CARD_H - 135, CARD_W - 240, 34, 24, (s) => `400 ${s}px ${SANS}`, 'rgba(255,255,255,.88)');
  centerText(ctx, c.footer, CARD_H - 78, CARD_W - 300, 26, 20, (s) => `400 ${s}px ${SANS}`, 'rgba(255,255,255,.7)');
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.6)';
  ctx.shadowBlur = 10;
  brand(ctx, 'rgba(255,255,255,.7)', CARD_W - 50, 64);
  ctx.restore();
}

function drawCompare(ctx: CanvasRenderingContext2D, c: CardInput) {
  ctx.fillStyle = '#0f0d0b';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const gap = 16;
  const top = 110;
  const h = 1330;
  const w = (CARD_W - 120 - gap) / 2;
  const before = c.before ?? c.photo;
  drawCover(ctx, before, 60, top, w, h);
  drawCover(ctx, c.photo, 60 + w + gap, top, w, h);
  // labels
  const label = (text: string, x: number, gold: boolean) => {
    ctx.save();
    ctx.font = `600 28px ${SANS}`;
    spacing(ctx, 5);
    const tw = ctx.measureText(text).width + 44;
    ctx.fillStyle = gold ? 'rgba(201,154,69,.95)' : 'rgba(20,18,15,.78)';
    ctx.beginPath();
    ctx.roundRect(x - tw / 2, top + h - 90, tw, 56, 28);
    ctx.fill();
    ctx.fillStyle = gold ? '#1b1510' : '#f3e7cf';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + 2, top + h - 52);
    ctx.restore();
  };
  label((c.beforeLabel ?? 'VORHER').toUpperCase(), 60 + w / 2, false);
  label((c.afterLabel ?? 'NACHHER').toUpperCase(), 60 + w + gap + w / 2, true);
  centerText(ctx, c.title, top + h + 130, CARD_W - 200, 76, 42, (s) => `600 ${s}px ${DISPLAY}`, '#f3e7cf', 2);
  centerText(ctx, c.meta || c.footer, top + h + 200, CARD_W - 260, 32, 22, (s) => `400 ${s}px ${SANS}`, '#b9ad99');
  brand(ctx, '#6f6556', CARD_W - 60, CARD_H - 40);
}

export async function renderCard(c: CardInput): Promise<Blob> {
  await loadCardFonts();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.textBaseline = 'alphabetic';
  if (c.style === 'museum') drawMuseum(ctx, c);
  else if (c.style === 'pure') drawPure(ctx, c);
  else if (c.style === 'compare') drawCompare(ctx, c);
  else drawGallery(ctx, c);
  const blob = await toJpeg(canvas, 0.92);
  canvas.width = canvas.height = 0;
  return blob;
}
