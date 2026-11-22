import { t } from '../shared/i18n';

// Copy text from an image: shows the tab screenshot, the user drags a rectangle over the text
// and the recognized text (Tesseract, bundled in public/vendor, no network) goes to the clipboard.
const SHOT_KEY = 'ocrShot'; // same key as src/background/ocr.ts
const MIN_SIDE = 8;
/** Upscaling small crops helps Tesseract a lot. */
const TARGET_HEIGHT = 900;
const VENDOR = 'vendor/tesseract';

interface Worker {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text?: string } }>;
  setParameters(params: Record<string, string>): Promise<unknown>;
}
interface TesseractModule {
  createWorker(lang: string, oem: number, options: Record<string, unknown>): Promise<Worker>;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`missing #${id}`);
  return found;
}
const stage = el('stage') as HTMLDivElement;
const shot = el('shot') as HTMLImageElement;
const sel = el('sel') as HTMLDivElement;
const tip = el('tip') as HTMLDivElement;
const panel = el('panel');
const statusEl = el('status');
const textEl = el('text') as HTMLTextAreaElement;
const openerTabId = Number(new URLSearchParams(location.search).get('opener')) || null;

el('copy').textContent = t('ocrCopy');
el('again').textContent = t('ocrAgain');
el('close').setAttribute('aria-label', t('ocrClose'));
document.title = t('ocrTitle');

// The engine warms up while the user is still selecting. It is loaded by URL so the bundler
// leaves the vendored file alone.
const workerPromise: Promise<Worker> = (async () => {
  const mod = (await import(
    /* @vite-ignore */ chrome.runtime.getURL(`${VENDOR}/tesseract.esm.min.js`)
  )) as { default: TesseractModule };
  const worker = await mod.default.createWorker('spa+eng', 1, {
    workerPath: chrome.runtime.getURL(`${VENDOR}/worker.min.js`),
    corePath: chrome.runtime.getURL(`${VENDOR}/core`),
    langPath: chrome.runtime.getURL(`${VENDOR}/lang`),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: 'none',
  });
  // Keep indentation and spacing (useful when copying code).
  await worker.setParameters({ preserve_interword_spaces: '1' });
  return worker;
})();

async function loadShot(): Promise<void> {
  const stored = await chrome.storage.session.get(SHOT_KEY);
  await chrome.storage.session.remove(SHOT_KEY);
  const dataUrl: unknown = stored[SHOT_KEY];
  if (typeof dataUrl !== 'string') {
    tip.textContent = t('ocrNoShot');
    stage.style.cursor = 'default';
    return;
  }
  shot.src = dataUrl;
  await shot.decode();
  tip.textContent = t('ocrTip');
}

// ---- Selection ----
let start: { x: number; y: number } | null = null;
let busy = false;

function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

function drawSel(r: Rect): void {
  Object.assign(sel.style, {
    left: `${String(r.x)}px`,
    top: `${String(r.y)}px`,
    width: `${String(r.w)}px`,
    height: `${String(r.h)}px`,
  });
  sel.hidden = false;
}

stage.addEventListener('pointerdown', (e) => {
  if (busy || e.button !== 0 || shot.naturalWidth === 0) return;
  start = { x: e.clientX, y: e.clientY };
  stage.setPointerCapture(e.pointerId);
  stage.classList.add('selecting');
  stage.classList.remove('has-sel');
  panel.hidden = true;
  drawSel({ ...start, w: 0, h: 0 });
});

stage.addEventListener('pointermove', (e) => {
  if (start) drawSel(rectFrom(start, { x: e.clientX, y: e.clientY }));
});

stage.addEventListener('pointerup', (e) => {
  if (!start) return;
  const r = rectFrom(start, { x: e.clientX, y: e.clientY });
  start = null;
  stage.classList.remove('selecting');
  if (r.w < MIN_SIDE || r.h < MIN_SIDE) {
    sel.hidden = true;
    return;
  }
  stage.classList.add('has-sel');
  void recognize(r);
});

// ---- Recognition ----
function crop(r: Rect): HTMLCanvasElement {
  // The screenshot is in device pixels; the image is shown at window width.
  const k = shot.naturalWidth / shot.clientWidth;
  const sx = Math.round(r.x * k);
  const sy = Math.round(r.y * k);
  const sw = Math.min(Math.round(r.w * k), shot.naturalWidth - sx);
  const sh = Math.min(Math.round(r.h * k), shot.naturalHeight - sy);
  const scale = Math.min(3, Math.max(1, TARGET_HEIGHT / sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(shot, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  normalize(ctx, canvas.width, canvas.height);
  return canvas;
}

/**
 * Leaves dark text on white. On dark backgrounds (code screenshots, dark themes) coloured text is
 * taken from its brightest channel and inverted; then contrast is stretched between the 1st and
 * 99th percentile (no hard threshold, so faint grey comments survive). Tesseract fails often without this.
 */
function normalize(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const n = w * h;
  let lumSum = 0;
  for (let i = 0; i < px.length; i += 4) {
    lumSum += 0.299 * (px[i] ?? 0) + 0.587 * (px[i + 1] ?? 0) + 0.114 * (px[i + 2] ?? 0);
  }
  const dark = lumSum / n < 110;
  const v = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const r = px[i] ?? 0;
    const g = px[i + 1] ?? 0;
    const b = px[i + 2] ?? 0;
    const x = dark ? 255 - Math.max(r, g, b) : Math.min(r, g, b);
    v[j] = x;
    hist[x] = (hist[x] ?? 0) + 1;
  }
  const percentile = (p: number): number => {
    let acc = 0;
    for (let k = 0; k < 256; k++) {
      acc += hist[k] ?? 0;
      if (acc >= n * p) return k;
    }
    return 255;
  };
  const lo = percentile(0.01);
  const hi = Math.max(percentile(0.99), lo + 1);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const o = Math.max(0, Math.min(255, (((v[j] ?? 0) - lo) * 255) / (hi - lo)));
    px[i] = px[i + 1] = px[i + 2] = o;
  }
  ctx.putImageData(img, 0, 0);
}

function tidy(text: string): string {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    textEl.focus();
    textEl.select();
    // Fallback when the Clipboard API is refused; there is no non-deprecated way to copy the textarea.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return document.execCommand('copy');
  }
}

async function recognize(r: Rect): Promise<void> {
  busy = true;
  stage.classList.add('busy');
  tip.textContent = t('ocrWorking');
  try {
    const worker = await workerPromise;
    const { data } = await worker.recognize(crop(r));
    const text = tidy(data.text ?? '');
    textEl.value = text;
    panel.hidden = false;
    if (text === '') statusEl.textContent = t('ocrEmpty');
    else statusEl.textContent = (await copy(text)) ? t('ocrCopied') : t('ocrCopyFailed');
    tip.textContent = '';
  } catch (e) {
    tip.textContent = `${t('ocrError')}: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    busy = false;
    stage.classList.remove('busy');
  }
}

// ---- Panel ----
el('copy').addEventListener('click', () => {
  void copy(textEl.value).then((ok) => {
    statusEl.textContent = ok ? t('ocrCopied') : t('ocrCopyFailed');
  });
});

el('again').addEventListener('click', () => {
  panel.hidden = true;
  sel.hidden = true;
  stage.classList.remove('has-sel');
  tip.textContent = t('ocrTip');
});

async function closeAndReturn(): Promise<void> {
  if (openerTabId !== null)
    await chrome.tabs.update(openerTabId, { active: true }).catch(() => undefined);
  const me = await chrome.tabs.getCurrent();
  if (me?.id !== undefined) await chrome.tabs.remove(me.id);
  else window.close();
}

el('close').addEventListener('click', () => void closeAndReturn());
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.activeElement === textEl) textEl.blur();
  else void closeAndReturn();
});

void loadShot();
