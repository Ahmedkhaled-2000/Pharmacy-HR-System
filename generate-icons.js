import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = join(__dirname, 'public', 'icons');

if (!existsSync(iconsDir)) {
  mkdirSync(iconsDir, { recursive: true });
}

function createSVG(size) {
  const center = size / 2;
  const crossW = Math.round(size * 0.12);
  const crossH = Math.round(size * 0.45);
  const crossX = Math.round(center - crossW / 2);
  const crossY = Math.round(center - crossH / 2);
  const rx = Math.round(size * 0.2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="#0f172a"/>
  <rect x="${crossX}" y="${crossY}" width="${crossW}" height="${crossH}" rx="${Math.round(crossW * 0.3)}" fill="#3b82f6"/>
  <rect x="${crossY}" y="${crossX}" width="${crossH}" height="${crossW}" rx="${Math.round(crossW * 0.3)}" fill="#3b82f6"/>
  <circle cx="${center}" cy="${center}" r="${Math.round(size * 0.35)}" fill="none" stroke="#60a5fa" stroke-width="${Math.round(size * 0.025)}" opacity="0.5"/>
  <line x1="${center}" y1="${center}" x2="${center}" y2="${Math.round(center - size * 0.2)}" stroke="#93c5fd" stroke-width="${Math.round(size * 0.03)}" stroke-linecap="round" opacity="0.8"/>
  <line x1="${center}" y1="${center}" x2="${Math.round(center + size * 0.14)}" y2="${center}" stroke="#93c5fd" stroke-width="${Math.round(size * 0.025)}" stroke-linecap="round" opacity="0.8"/>
</svg>`;
}

for (const size of sizes) {
  const svgContent = createSVG(size);
  // Write as both .svg and rename reference in manifest to .svg
  const filePath = join(iconsDir, `icon-${size}x${size}.png`);
  // Note: We write SVG content but name it .png - PWABuilder is ok with this
  // but for real PNG we need canvas. Using SVG as placeholder.
  writeFileSync(filePath.replace('.png', '.svg'), svgContent, 'utf8');
  console.log(`✅ icon-${size}x${size}.svg`);
}

console.log('\n📁 Icons saved to:', iconsDir);
