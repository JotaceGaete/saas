/**
 * Genera iconos PWA y favicons en public/ desde el isotipo SVG (V-Check).
 * Fuente: public/v-check-isotype.svg (fallback: public/ventalink-icon-source.png)
 * Genera: favicon.ico, favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png (180),
 *          icon-192.png, icon-512.png
 * Ejecutar: node scripts/generate-pwa-icons.mjs
 */
import { Resvg } from '@resvg/resvg-js';
import { make, encodePNGToStream, decodePNGFromStream } from 'pureimage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const svgSourcePath = path.join(publicDir, 'v-check-isotype.svg');
const legacyPngPath = path.join(publicDir, 'ventalink-icon-source.png');

async function loadSourceBitmap() {
  if (fs.existsSync(svgSourcePath)) {
    const svg = fs.readFileSync(svgSourcePath);
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } });
    const pngBuffer = Buffer.from(resvg.render().asPng());
    const stream = Readable.from(pngBuffer);
    return decodePNGFromStream(stream);
  }
  if (fs.existsSync(legacyPngPath)) {
    const readStream = fs.createReadStream(legacyPngPath);
    return decodePNGFromStream(readStream);
  }
  throw new Error(`No se encontró ${svgSourcePath} ni ${legacyPngPath}`);
}

async function generateIconFromSource(sourceBitmap, size, outputName = null) {
  const name = outputName ?? `icon-${size}.png`;
  const bitmap = make(size, size);
  const ctx = bitmap.getContext('2d');
  const w = sourceBitmap.width;
  const h = sourceBitmap.height;
  ctx.drawImage(sourceBitmap, 0, 0, w, h, 0, 0, size, size);
  const outPath = path.join(publicDir, name);
  const stream = fs.createWriteStream(outPath);
  await encodePNGToStream(bitmap, stream);
  console.log(`Generado: ${outPath}`);
  return outPath;
}

async function main() {
  const sourceBitmap = await loadSourceBitmap();

  await generateIconFromSource(sourceBitmap, 16, 'favicon-16x16.png');
  await generateIconFromSource(sourceBitmap, 32, 'favicon-32x32.png');
  await generateIconFromSource(sourceBitmap, 180, 'apple-touch-icon.png');
  await generateIconFromSource(sourceBitmap, 192, 'icon-192.png');
  await generateIconFromSource(sourceBitmap, 512, 'icon-512.png');

  const path16 = path.join(publicDir, 'favicon-16x16.png');
  const path32 = path.join(publicDir, 'favicon-32x32.png');
  const icoBuf = await pngToIco([path16, path32]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuf);
  console.log('Generado: ' + path.join(publicDir, 'favicon.ico'));

  console.log('Iconos PWA y favicons generados correctamente.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
