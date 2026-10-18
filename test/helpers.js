// Testdata: et lille, opdigtet kunderepo med alle felttyper.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function png(width, height, extraBytes = 0) {
  const buffer = Buffer.alloc(33 + extraBytes);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

export function jpeg(width, height) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9
  ]);
}

export function tempDir(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-check-'));
  for (const [name, data] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  }
  return dir;
}

export const schema = {
  version: 1,
  languages: ['da', 'en'],
  files: {
    global: {
      label: 'Fælles info',
      fields: {
        firma: { type: 'text', label: 'Firmanavn', required: true, maxLength: 20, editor: false },
        telefon: { type: 'phone', label: 'Telefon', required: true },
        facebook: { type: 'url', label: 'Facebook', startsWith: ['https://www.facebook.com/'] },
        postnr: { type: 'text', label: 'Postnummer', pattern: '^[0-9]{4}$', patternMessage: 'Postnummeret skal være 4 cifre.' },
        tider: { type: 'hours', label: 'Åbningstider', days: { man: 'Mandag', tir: 'Tirsdag' }, maxRangesPerDay: 2 },
        ferie: { type: 'dateRange', label: 'Ferielukning' },
        betaling: { type: 'list', label: 'Betaling', maxItems: 3, item: { type: 'text', translatable: true, required: true, maxLength: 20 } }
      }
    },
    forside: {
      label: 'Forside',
      fields: {
        hero: {
          type: 'group',
          label: 'Toppen',
          fields: {
            overskrift: { type: 'text', label: 'Overskrift', translatable: true, required: true, maxLength: 20, lineBreaks: 1 },
            intro: { type: 'longtext', label: 'Intro', translatable: true, minLength: 10, maxLength: 100 },
            tekst: { type: 'richtext', label: 'Tekst', translatable: true, maxLength: 30, allow: ['p', 'strong', 'a'] },
            billede: { type: 'image', label: 'Billede', required: true, image: { width: 400, height: 300 }, alt: { translatable: true, maxLength: 50 } },
            logo: { type: 'image', label: 'Logo', image: { width: 100, height: 100 }, alt: { maxLength: 50 } }
          }
        },
        opdateret: { type: 'date', label: 'Opdateret' }
      }
    },
    menu: {
      label: 'Menukort',
      fields: {
        kategorier: {
          type: 'list',
          label: 'Menukort',
          itemLabel: 'Kategori',
          minItems: 1,
          maxItems: 3,
          item: {
            type: 'group',
            fields: {
              id: { type: 'id', editor: false },
              navn: { type: 'text', label: 'Navn', translatable: true, required: true, maxLength: 30 },
              retter: {
                type: 'list',
                label: 'Retter',
                itemLabel: 'Ret',
                item: {
                  type: 'group',
                  fields: {
                    navn: { type: 'text', label: 'Navn på retten', translatable: true, required: true, maxLength: 30 },
                    pris: { type: 'price', label: 'Pris', min: 0, max: 999 },
                    allergener: { type: 'multiselect', label: 'Allergener', options: { gluten: 'Gluten', egg: 'Æg' } }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

export function goodContent() {
  return {
    global: {
      firma: 'Testcafé',
      telefon: '+45 12 34 56 78',
      facebook: 'https://www.facebook.com/testcafe',
      postnr: '5000',
      tider: { man: [{ fra: '10:00', til: '14:00' }, { fra: '17:00', til: '21:00' }], tir: [] },
      ferie: { fra: null, til: null },
      betaling: [{ da: 'Kontant', en: 'Cash' }]
    },
    forside: {
      hero: {
        overskrift: { da: 'Velkommen\ntil os', en: 'Welcome' },
        intro: { da: 'En hyggelig café i byen.', en: 'A cosy café in town.' },
        tekst: { da: '<p><strong>Hej</strong> <a href="https://x.dk">os</a></p>', en: '<p>Hi</p>' },
        billede: { src: '/images/hero.jpg', alt: { da: 'Caféen udefra', en: 'The café from outside' } },
        logo: { src: '/images/logo.png', alt: 'Logo' }
      },
      opdateret: '2026-10-19'
    },
    menu: {
      kategorier: [
        {
          id: 'kaffe',
          navn: { da: 'Kaffe', en: 'Coffee' },
          retter: [
            { navn: { da: 'Latte', en: 'Latte' }, pris: 45, allergener: [] },
            { navn: { da: 'Kage', en: 'Cake' }, pris: null, allergener: ['gluten', 'egg'] }
          ]
        }
      ]
    }
  };
}

export function publicDir(extra = {}) {
  return tempDir({ 'images/hero.jpg': jpeg(800, 600), 'images/logo.png': png(200, 200), ...extra });
}
