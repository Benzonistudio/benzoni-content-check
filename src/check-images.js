// Tjekker filtype og størrelse på alle billeder i public/ (også dem, der ikke står i content/).

import fs from 'node:fs';
import path from 'node:path';
import { IMAGE_EXTENSIONS, MAX_IMAGE_BYTES } from './validate-content.js';

const OTHER_IMAGE_EXTENSIONS = ['.gif', '.bmp', '.tif', '.tiff', '.heic', '.heif'];

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

// skip: adresser som "/images/logo.jpg", der allerede er tjekket via content/.
export function checkImages({ publicDir, skip = [] }) {
  const errors = [];
  const skipped = new Set(skip.map(src => path.resolve(publicDir, `.${src}`)));
  for (const file of listFiles(publicDir)) {
    const extension = path.extname(file).toLowerCase();
    const relative = `/${path.relative(publicDir, file).split(path.sep).join('/')}`;
    if (skipped.has(file)) continue;
    if (OTHER_IMAGE_EXTENSIONS.includes(extension)) {
      errors.push({ path: null, audience: 'patrick', message: `Billedet ${relative} skal være jpg, png, webp eller avif.`, detail: `filtypen ${extension} understøttes ikke af alle browsere`, file: `public${relative}` });
      continue;
    }
    if (!IMAGE_EXTENSIONS.includes(extension)) continue;
    const bytes = fs.statSync(file).size;
    if (bytes > MAX_IMAGE_BYTES) {
      errors.push({ path: null, audience: 'patrick', message: `Billedet ${relative} fylder ${Math.round(bytes / 1024)} KB. Det må højst fylde ${MAX_IMAGE_BYTES / 1024} KB.`, detail: `${relative} fylder ${bytes} bytes`, file: `public${relative}` });
    }
  }
  return errors;
}
