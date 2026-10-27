// Tjekker indholdet i content/*.json mod reglerne i content/schema.json.
// Hver fejl har formen { path, language, audience, message, detail, file }.
//   path      feltets sti, samme som data-edit på siden (fx "forside.hero.overskrift")
//   audience  "kunde" hvis kunden selv kan rette det i editoren, ellers "patrick"
//   message   dansk besked i hverdagssprog
//   detail    teknisk forklaring til Patrick

import fs from 'node:fs';
import path from 'node:path';
import { imageSize } from './image-size.js';
import { validateCookies } from './cookies.js';

export const MAX_IMAGE_BYTES = 500 * 1024;
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.svg'];
const LANGUAGE_NAMES = { da: 'dansk', en: 'engelsk', de: 'tysk' };

const isEmpty = value => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
const length = text => [...text].length;
const kb = bytes => `${Math.round(bytes / 1024)} KB`;

// ---------- Beskeder ----------

function describe(at, language) {
  const extra = [at.context, at.translatable && at.languages.length > 1 && language ? LANGUAGE_NAMES[language] || language : null].filter(Boolean);
  return `"${at.label}"${extra.length ? ` (${extra.join(', ')})` : ''}`;
}

function report(state, at, problem, { language, detail } = {}) {
  state.errors.push({
    path: at.path,
    ...(language ? { language } : {}),
    audience: at.editor ? 'kunde' : 'patrick',
    message: problem.replace('{felt}', describe(at, language)),
    detail: `${at.file}: ${at.path}${language ? ` (${language})` : ''}: ${detail || problem.replace('{felt}', at.label)}`,
    file: at.file
  });
}

// ---------- Opslag i schema ----------

function childAt(at, field, key) {
  return {
    ...at,
    path: `${at.path}.${key}`,
    label: field.label || key,
    context: at.groupLabel || at.context,
    groupLabel: null,
    editor: at.editor && field.editor !== false,
    translatable: Boolean(field.translatable)
  };
}

// Finder feltets regler og beskrivelse ud fra en sti som "menukort.kategorier.0.retter.1.pris".
export function findField(schema, fieldPath) {
  const [file, ...parts] = fieldPath.split('.');
  const def = schema.files?.[file];
  if (!def) return null;
  let field = { type: 'group', label: def.label, fields: def.fields };
  let at = rootAt(schema, file, def);
  for (const part of parts) {
    if (field.type === 'list') {
      if (!/^\d+$/.test(part)) return null;
      const label = `${field.itemLabel || 'Element'} ${Number(part) + 1}`;
      at = itemAt(at, field.item, part, label);
      field = field.item;
    } else if (field.type === 'group' && field.fields?.[part]) {
      const next = field.fields[part];
      at = childAt(at, next, part);
      if (next.type === 'group') at.groupLabel = next.label || at.groupLabel;
      field = next;
    } else {
      return null;
    }
  }
  return { field, at };
}

function itemAt(at, item, index, label) {
  return {
    ...at,
    path: `${at.path}.${index}`,
    groupLabel: label,
    context: label,
    editor: at.editor && item?.editor !== false,
    translatable: Boolean(item?.translatable)
  };
}

function rootAt(schema, file, def) {
  return {
    path: file,
    file: `content/${file}.json`,
    label: def.label || file,
    context: null,
    groupLabel: def.label || null,
    editor: def.editor !== false,
    translatable: false,
    languages: schema.languages || ['da']
  };
}

// ---------- Regler pr. type ----------

function checkText(state, field, text, at, language) {
  if (typeof text !== 'string') return report(state, at, 'Feltet {felt} skal være en tekst.', { language });
  const plain = field.type === 'richtext' ? richtextPlain(state, field, text, at, language) : text;
  const count = length(plain.trim());
  if (field.maxLength && count > field.maxLength) {
    report(state, at, `Teksten i {felt} er for lang (${count} tegn). Gør den højst ${field.maxLength} tegn.`, { language });
  }
  if (field.minLength && count > 0 && count < field.minLength) {
    report(state, at, `Teksten i {felt} er for kort (${count} tegn). Skriv mindst ${field.minLength} tegn.`, { language });
  }
  if (field.type === 'text') {
    const breaks = (text.match(/\n/g) || []).length;
    const allowed = field.lineBreaks || 0;
    if (breaks > allowed) {
      report(state, at, allowed ? `Teksten i {felt} må højst have ${allowed} linjeskift.` : 'Teksten i {felt} skal stå på én linje.', { language });
    }
  }
  if (field.pattern && !new RegExp(field.pattern).test(text)) {
    report(state, at, field.patternMessage ? `{felt}: ${field.patternMessage}` : 'Feltet {felt} har ikke den rigtige form.', { language, detail: `matcher ikke ${field.pattern}` });
  }
}

// Formateret tekst: kun tilladte tags og sikre links. Returnerer teksten uden tags.
function richtextPlain(state, field, html, at, language) {
  const allow = field.allow || ['p', 'strong', 'em', 'a', 'ul', 'li', 'br'];
  for (const [, tag, attrs] of html.matchAll(/<\/?([a-zA-Z0-9]+)([^>]*)>/g)) {
    const name = tag.toLowerCase();
    if (!allow.includes(name)) {
      report(state, at, `Teksten i {felt} indeholder formatering, der ikke er tilladt. Brug kun fed, kursiv, links og punktlister.`, { language, detail: `<${name}> er ikke tilladt` });
      continue;
    }
    const extra = attrs.trim().replace(/\/$/, '').trim();
    if (!extra) continue;
    const href = name === 'a' && extra.match(/^href="([^"]*)"$/);
    if (!href) {
      report(state, at, 'Teksten i {felt} indeholder formatering, der ikke er tilladt.', { language, detail: `egenskaben ${extra} på <${name}> er ikke tilladt` });
    } else if (!/^(https:\/\/|mailto:|tel:|\/)/.test(href[1])) {
      report(state, at, `Et link i {felt} skal starte med https://.`, { language, detail: `usikkert link ${href[1]}` });
    }
  }
  return html.replace(/<[^>]*>/g, '').replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, ' ');
}

const validDate = text => {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};
const validTime = text => typeof text === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(text);

function checkUrl(state, field, value, at) {
  let url;
  try { url = new URL(value); } catch { url = null; }
  if (!url || url.protocol !== 'https:') return report(state, at, 'Linket i {felt} skal være en hel adresse, der starter med https://.', { detail: `ugyldigt link ${value}` });
  if (field.startsWith && !field.startsWith.some(prefix => value.startsWith(prefix))) {
    report(state, at, `Linket i {felt} skal starte med ${field.startsWith[0]}`, { detail: `skal starte med en af ${field.startsWith.join(', ')}` });
  }
}

function checkPhone(state, value, at) {
  const digits = String(value).replace(/\D/g, '');
  if (!/^\+?[0-9 ]+$/.test(String(value)) || digits.length < 8 || digits.length > 15) {
    report(state, at, 'Telefonnummeret i {felt} ser ikke rigtigt ud. Skriv fx +45 12 34 56 78.', { detail: `ugyldigt nummer ${value}` });
  }
}

function checkPrice(state, field, value, at) {
  const min = field.min ?? 0;
  const max = field.max ?? 99999;
  if (!Number.isInteger(value)) return report(state, at, 'Prisen i {felt} skal være et helt tal i kroner, fx 95.', { detail: `${JSON.stringify(value)} er ikke et heltal` });
  if (value < min || value > max) report(state, at, `Prisen i {felt} skal være mellem ${min} og ${max} kr.`);
}

function checkDateRange(state, field, value, at) {
  if (!value || typeof value !== 'object') return report(state, at, 'Feltet {felt} mangler.', { detail: 'skal være { fra, til }' });
  const { fra, til } = value;
  if (isEmpty(fra) && isEmpty(til)) {
    if (field.required) report(state, at, 'Vælg en første og en sidste dag i {felt}.');
    return;
  }
  if (isEmpty(fra) || isEmpty(til)) return report(state, at, 'Vælg både en første og en sidste dag i {felt}.');
  if (!validDate(fra) || !validDate(til)) return report(state, at, 'Datoerne i {felt} er ikke rigtige datoer.', { detail: `${fra} / ${til}` });
  if (fra > til) report(state, at, 'Den sidste dag i {felt} ligger før den første dag.', { detail: `${fra} er efter ${til}` });
}

function checkHours(state, field, value, at) {
  if (!value || typeof value !== 'object') return report(state, at, 'Feltet {felt} mangler.');
  const days = field.days || {};
  const max = field.maxRangesPerDay || 2;
  for (const key of Object.keys(value)) {
    if (!(key in days)) report(state, at, 'Feltet {felt} har en ukendt ugedag.', { detail: `ukendt dag ${key}` });
  }
  for (const [key, dayName] of Object.entries(days)) {
    const ranges = value[key];
    if (!Array.isArray(ranges)) { report(state, at, `${dayName} mangler i {felt}.`, { detail: `${key} skal være en liste` }); continue; }
    if (ranges.length > max) report(state, at, `${dayName} i {felt} må højst have ${max} tidsrum.`);
    const sorted = [];
    for (const range of ranges) {
      if (!validTime(range?.fra) || !validTime(range?.til)) { report(state, at, `Tiderne for ${dayName.toLowerCase()} i {felt} skal skrives som 11:30.`, { detail: JSON.stringify(range) }); continue; }
      if (range.fra >= range.til) report(state, at, `For ${dayName.toLowerCase()} i {felt} skal I åbne, før I lukker.`, { detail: `${range.fra}-${range.til}` });
      sorted.push(range);
    }
    sorted.sort((a, b) => a.fra.localeCompare(b.fra));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].fra < sorted[i - 1].til) report(state, at, `Tidsrummene for ${dayName.toLowerCase()} i {felt} overlapper hinanden.`);
    }
  }
}

function checkImage(state, field, value, at) {
  // Et valgfrit billede må mangle helt.
  if (!field.required && (value === undefined || value === null || (typeof value === 'object' && isEmpty(value.src)))) return;
  if (!value || typeof value !== 'object') return report(state, at, 'Vælg et billede til {felt}.');
  const { src, alt } = value;

  const altField = field.alt || {};
  const altAt = { ...at, translatable: Boolean(altField.translatable) };
  const altValues = altField.translatable ? at.languages.map(language => [language, alt?.[language]]) : [[null, alt]];
  for (const [language, text] of altValues) {
    // Mangler en oversættelse, bruger siden den danske beskrivelse.
    if (isEmpty(text) && language && language !== 'da') continue;
    if (isEmpty(text)) report(state, altAt, 'Billedet {felt} mangler en kort beskrivelse af, hvad billedet viser.', { language, detail: 'alt-tekst mangler' });
    else if (altField.maxLength && length(text) > altField.maxLength) report(state, altAt, `Beskrivelsen af billedet {felt} er for lang (${length(text)} tegn). Gør den højst ${altField.maxLength} tegn.`, { language });
  }

  if (isEmpty(src)) return report(state, at, 'Vælg et billede til {felt}.');
  if (typeof src !== 'string' || !src.startsWith('/')) return report(state, at, 'Billedet {felt} har en forkert adresse.', { detail: `src skal starte med /: ${src}` });
  const extension = path.extname(src).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(extension)) return report(state, at, 'Billedet {felt} skal være et jpg-, png-, webp- eller avif-billede.', { detail: `filtype ${extension}` });
  if (!state.publicDir) return;

  const file = path.resolve(state.publicDir, `.${src}`);
  if (!file.startsWith(path.resolve(state.publicDir) + path.sep) || !fs.existsSync(file)) {
    return report(state, at, 'Billedet {felt} kan ikke findes. Vælg billedet igen.', { detail: `filen ${src} findes ikke` });
  }
  const bytes = fs.statSync(file).size;
  if (bytes > MAX_IMAGE_BYTES) {
    report(state, at, `Billedet {felt} fylder ${kb(bytes)}. Det må højst fylde ${kb(MAX_IMAGE_BYTES)}. Vælg et mindre billede.`, { detail: `${src} fylder ${bytes} bytes` });
  }
  if (extension === '.svg' || !field.image) return;
  const size = imageSize(fs.readFileSync(file));
  if (!size) return extension === '.avif' ? undefined : report(state, at, 'Billedet {felt} kan ikke læses. Vælg billedet igen.', { detail: `kan ikke læse størrelsen på ${src}` });
  const want = field.image.width / field.image.height;
  const got = size.width / size.height;
  if (Math.abs(got - want) / want > 0.01) {
    report(state, at, 'Billedet {felt} har ikke det rigtige format. Vælg billedet igen, så det kan beskæres.', { detail: `${src} er ${size.width}x${size.height}, pladsen er ${field.image.width}x${field.image.height}` });
  } else if (size.width < field.image.width || size.height < field.image.height) {
    report(state, at, 'Billedet {felt} er for lille og bliver uskarpt. Vælg et større billede.', { detail: `${src} er ${size.width}x${size.height}, mindst ${field.image.width}x${field.image.height}` });
  }
}

function checkList(state, field, value, at) {
  if (!Array.isArray(value)) return report(state, at, 'Feltet {felt} skal være en liste.');
  if (field.minItems && value.length < field.minItems) report(state, at, `Der skal være mindst ${field.minItems} i {felt}.`);
  if (field.maxItems && value.length > field.maxItems) report(state, at, `Der må højst være ${field.maxItems} i {felt}. Fjern nogle.`);
  const idFields = field.item?.type === 'group' ? Object.entries(field.item.fields || {}).filter(([, f]) => f.type === 'id').map(([key]) => key) : [];
  for (const key of idFields) {
    const seen = new Set();
    for (const item of value) {
      if (item && seen.has(item[key])) report(state, at, 'To elementer i {felt} har samme id.', { detail: `id "${item[key]}" findes flere gange` });
      if (item) seen.add(item[key]);
    }
  }
  value.forEach((item, index) => {
    const itemName = item && typeof item === 'object' ? item.navn?.da ?? item.navn ?? item.name?.da ?? item.name : null;
    const label = `${field.itemLabel || 'Element'} ${index + 1}${typeof itemName === 'string' ? ` "${itemName}"` : ''}`;
    checkValue(state, field.item, item, itemAt(at, field.item, index, label));
  });
}

function checkGroup(state, field, value, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return report(state, at, 'Feltet {felt} mangler.', { detail: 'skal være et objekt' });
  const fields = field.fields || {};
  for (const key of Object.keys(value)) {
    if (!(key in fields)) report(state, { ...at, path: `${at.path}.${key}`, editor: false }, `Feltet "${key}" står ikke i schema.json.`, { detail: 'ukendt felt, måske en stavefejl' });
  }
  for (const [key, child] of Object.entries(fields)) {
    const childValue = value[key];
    const next = childAt(at, child, key);
    if (child.type === 'group') next.groupLabel = child.label || at.groupLabel;
    checkValue(state, child, childValue, next);
  }
}

// Tjekker én værdi ud fra feltets type.
function checkValue(state, field, value, at) {
  if (!field || !field.type) return report(state, { ...at, editor: false }, `Feltet ${at.path} har ingen type i schema.json.`);

  if (field.type === 'group') return checkGroup(state, field, value, at);
  if (field.type === 'list') return checkList(state, field, value, at);
  if (field.type === 'hours') return checkHours(state, field, value, at);
  if (field.type === 'dateRange') return checkDateRange(state, field, value, at);
  if (field.type === 'image') return checkImage(state, field, value, at);

  if (field.translatable && ['text', 'longtext', 'richtext'].includes(field.type)) {
    if (isEmpty(value)) return field.required ? report(state, at, 'Feltet {felt} skal udfyldes.', { language: 'da' }) : undefined;
    if (typeof value !== 'object' || Array.isArray(value)) return report(state, at, 'Feltet {felt} skal have tekst på hvert sprog.', { detail: 'skal være { da, en, de }' });
    for (const key of Object.keys(value)) {
      if (!at.languages.includes(key)) report(state, { ...at, editor: false }, 'Feltet {felt} har et ukendt sprog.', { detail: `ukendt sprog ${key}` });
    }
    // Kun dansk skal udfyldes. Mangler engelsk eller tysk, viser siden den danske tekst.
    // Er feltet valgfrit, skal dansk kun udfyldes, hvis et andet sprog har tekst.
    const anyText = at.languages.some(language => !isEmpty(value[language]));
    for (const language of at.languages) {
      const text = value[language];
      if (isEmpty(text)) {
        if (language === 'da' && (field.required || anyText)) report(state, at, 'Feltet {felt} skal udfyldes.', { language });
        continue;
      }
      checkText(state, field, text, at, language);
    }
    return;
  }

  if (isEmpty(value) || (Array.isArray(value) && !value.length && field.type !== 'multiselect')) {
    if (field.required) report(state, at, 'Feltet {felt} skal udfyldes.');
    return;
  }

  switch (field.type) {
    case 'text':
    case 'longtext':
    case 'richtext':
      return checkText(state, field, value, at);
    case 'url':
      return checkUrl(state, field, value, at);
    case 'phone':
      return checkPhone(state, value, at);
    case 'price':
      return checkPrice(state, field, value, at);
    case 'date':
      return validDate(value) ? undefined : report(state, at, 'Datoen i {felt} er ikke en rigtig dato.', { detail: `${value} skal være ÅÅÅÅ-MM-DD` });
    case 'id':
      return typeof value === 'string' && /^[a-z0-9-]+$/.test(value) ? undefined : report(state, { ...at, editor: false }, 'Feltet {felt} har et ugyldigt id.', { detail: `${value} må kun indeholde a-z, 0-9 og -` });
    case 'toggle':
      return typeof value === 'boolean' ? undefined : report(state, at, 'Feltet {felt} skal være slået til eller fra.', { detail: `${JSON.stringify(value)} er ikke true eller false` });
    case 'multiselect': {
      if (!Array.isArray(value)) return report(state, at, 'Feltet {felt} skal være en liste.');
      const options = Object.keys(field.options || {});
      for (const item of value) if (!options.includes(item)) report(state, at, `{felt} indeholder et ukendt valg.`, { detail: `"${item}" er ikke et af ${options.join(', ')}` });
      if (new Set(value).size !== value.length) report(state, at, '{felt} indeholder det samme valg flere gange.');
      return;
    }
    default:
      return report(state, { ...at, editor: false }, `Feltet ${at.path} har en ukendt type i schema.json.`, { detail: `ukendt type ${field.type}` });
  }
}

// ---------- Offentlige funktioner ----------

export function validateContent({ schema, content, publicDir = null }) {
  const state = { errors: validateCookies(content?.global?.cookies), publicDir };
  if (!schema?.files) {
    state.errors.push({ path: null, audience: 'patrick', message: 'content/schema.json mangler eller er forkert.', detail: 'schema.files mangler', file: 'content/schema.json' });
    return state.errors;
  }
  for (const [file, def] of Object.entries(schema.files)) {
    const at = rootAt(schema, file, def);
    if (!content?.[file]) {
      state.errors.push({ path: file, audience: 'patrick', message: `Filen content/${file}.json mangler.`, detail: `content/${file}.json findes ikke`, file: at.file });
      continue;
    }
    checkGroup(state, { type: 'group', fields: def.fields }, content[file], at);
  }
  for (const file of Object.keys(content || {})) {
    if (!schema.files[file]) state.errors.push({ path: file, audience: 'patrick', message: `Filen content/${file}.json står ikke i schema.json.`, detail: 'ukendt fil', file: `content/${file}.json` });
  }
  return state.errors;
}

// Alle billeder, som indholdet bruger, fx ["/images/logo.jpg"]. Bruges til ikke at melde det samme billede to gange.
export function imageSources(schema, content) {
  const sources = new Set();
  const visit = (field, value) => {
    if (!field || value === null || value === undefined) return;
    if (field.type === 'image' && typeof value.src === 'string') sources.add(value.src);
    else if (field.type === 'group') for (const [key, child] of Object.entries(field.fields || {})) visit(child, value[key]);
    else if (field.type === 'list' && Array.isArray(value)) value.forEach(item => visit(field.item, item));
  };
  for (const [file, def] of Object.entries(schema.files || {})) visit({ type: 'group', fields: def.fields }, content?.[file]);
  return [...sources];
}

// Tjekker ét felt, fx mens kunden skriver i editoren.
export function validateField(schema, fieldPath, value, { publicDir = null } = {}) {
  const found = findField(schema, fieldPath);
  if (!found) return [{ path: fieldPath, audience: 'patrick', message: 'Feltet findes ikke.', detail: `${fieldPath} står ikke i schema.json`, file: null }];
  const state = { errors: [], publicDir };
  checkValue(state, found.field, value, found.at);
  return state.errors;
}

// Læser content/*.json og content/schema.json fra et kunderepo.
export function loadContent(rootDir) {
  const contentDir = path.join(rootDir, 'content');
  const schema = JSON.parse(fs.readFileSync(path.join(contentDir, 'schema.json'), 'utf8'));
  const content = {};
  for (const name of fs.readdirSync(contentDir)) {
    if (!name.endsWith('.json') || name === 'schema.json') continue;
    content[name.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(contentDir, name), 'utf8'));
  }
  return { schema, content };
}
