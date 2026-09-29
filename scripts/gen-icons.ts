import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

/** Rasterizes scripts/assets/icon.svg into the PNG sizes the manifest references. */
const SIZES = [16, 32, 48, 128] as const;
const svg = readFileSync('scripts/assets/icon.svg', 'utf8');

for (const size of SIZES) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(`public/icons/icon-${size}.png`, png);
  console.log(`public/icons/icon-${size}.png`);
}
