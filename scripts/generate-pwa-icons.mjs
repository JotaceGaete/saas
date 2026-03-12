/**
 * Genera iconos PWA (192x192 y 512x512) en public/.
 * Ejecutar: node scripts/generate-pwa-icons.mjs
 */
import { make, encodePNGToStream } from 'pureimage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const themeColor = '#7C3AED';

async function generateIcon(size) {
  const bitmap = make(size, size);
  const ctx = bitmap.getContext('2d');
  ctx.fillStyle = themeColor;
  ctx.fillRect(0, 0, size, size);
  const outPath = path.join(publicDir, `icon-${size}.png`);
  const stream = fs.createWriteStream(outPath);
  await encodePNGToStream(bitmap, stream);
  console.log(`Generado: ${outPath}`);
}

async function main() {
  await generateIcon(192);
  await generateIcon(512);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
