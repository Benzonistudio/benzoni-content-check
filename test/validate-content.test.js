import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContent, validateField, findField, imageSources } from '../src/index.js';
import { schema, goodContent, publicDir, png, jpeg } from './helpers.js';

const dir = publicDir();
const check = (change, options = {}) => {
  const content = goodContent();
  change(content);
  return validateContent({ schema, content, publicDir: options.publicDir ?? dir });
};
const paths = errors => errors.map(error => error.path);

test('godt indhold giver ingen fejl', () => {
  assert.deepEqual(validateContent({ schema, content: goodContent(), publicDir: dir }), []);
});

test('fejl har sti, modtager, dansk besked og fil', () => {
  const [error] = check(c => { c.forside.hero.overskrift.da = 'En overskrift der er alt for lang'; });
  assert.equal(error.path, 'forside.hero.overskrift');
  assert.equal(error.language, 'da');
  assert.equal(error.audience, 'kunde');
  assert.equal(error.file, 'content/forside.json');
  assert.equal(error.message, 'Teksten i "Overskrift" (Toppen, dansk) er for lang (33 tegn). Gør den højst 20 tegn.');
});

test('påkrævede felter og sprog', () => {
  assert.deepEqual(paths(check(c => { delete c.forside.hero.overskrift; })), ['forside.hero.overskrift']);
  assert.deepEqual(check(c => { delete c.forside.hero.overskrift.en; }), [], 'påkrævet felt må mangle engelsk: siden viser dansk');
  const missingDanish = check(c => { delete c.forside.hero.overskrift.da; });
  assert.equal(missingDanish.length, 1);
  assert.equal(missingDanish[0].language, 'da');
  assert.deepEqual(check(c => { c.forside.hero.intro = { da: '' }; }), [], 'valgfrit felt må være helt tomt');
  assert.deepEqual(check(c => { delete c.forside.hero.intro.en; }), [], 'valgfrit felt må mangle et sprog');
  assert.deepEqual(paths(check(c => { c.forside.hero.intro.da = ''; c.forside.hero.intro.en = 'x'.repeat(20); })), ['forside.hero.intro'], 'dansk skal altid findes');
  assert.match(check(c => { c.forside.hero.overskrift.fr = 'Bonjour'; })[0].detail, /ukendt sprog fr/);
});

test('tegngrænser, linjeskift og mønster', () => {
  assert.match(check(c => { c.forside.hero.intro.da = 'Kort'; })[0].message, /for kort \(4 tegn\)/);
  assert.match(check(c => { c.forside.hero.overskrift.da = 'En\nto\ntre'; })[0].message, /højst have 1 linjeskift/);
  assert.match(check(c => { c.global.firma = 'Linje\nto'; })[0].message, /én linje/);
  assert.match(check(c => { c.global.postnr = '500'; })[0].message, /Postnummeret skal være 4 cifre/);
  assert.deepEqual(check(c => { c.forside.hero.overskrift.da = 'æøå'.repeat(6); }), [], 'tegn tælles som tegn, ikke bytes');
});

test('formateret tekst', () => {
  assert.deepEqual(check(c => { c.forside.hero.tekst.da = '<p>' + 'a'.repeat(30) + '</p>'; }), [], 'tags tælles ikke med');
  assert.match(check(c => { c.forside.hero.tekst.da = '<p>' + 'a'.repeat(31) + '</p>'; })[0].message, /for lang/);
  assert.match(check(c => { c.forside.hero.tekst.da = '<h1>Stor</h1>'; })[0].detail, /<h1> er ikke tilladt/);
  assert.match(check(c => { c.forside.hero.tekst.da = '<script>alert(1)</script>'; })[0].detail, /<script> er ikke tilladt/);
  assert.match(check(c => { c.forside.hero.tekst.da = '<p onclick="x">Hej</p>'; })[0].detail, /onclick/);
  assert.match(check(c => { c.forside.hero.tekst.da = '<a href="javascript:alert(1)">x</a>'; })[0].detail, /usikkert link/);
  assert.match(check(c => { c.forside.hero.tekst.da = '<a href="https://x.dk" style="color:red">x</a>'; })[0].detail, /style/);
});

test('telefon, links og datoer', () => {
  assert.match(check(c => { c.global.telefon = '12 34'; })[0].message, /Telefonnummeret/);
  assert.match(check(c => { c.global.telefon = 'ring til os'; })[0].message, /Telefonnummeret/);
  assert.match(check(c => { c.global.facebook = 'http://www.facebook.com/x'; })[0].message, /https:\/\//);
  assert.match(check(c => { c.global.facebook = 'https://instagram.com/x'; })[0].message, /starte med https:\/\/www\.facebook\.com\//);
  assert.match(check(c => { c.forside.opdateret = '2026-02-30'; })[0].message, /ikke en rigtig dato/);
  assert.deepEqual(check(c => { c.forside.opdateret = null; }), []);
});

test('perioder', () => {
  assert.deepEqual(check(c => { c.global.ferie = { fra: '2026-12-20', til: '2026-12-27' }; }), []);
  assert.match(check(c => { c.global.ferie = { fra: '2026-12-27', til: '2026-12-20' }; })[0].message, /ligger før den første dag/);
  assert.match(check(c => { c.global.ferie = { fra: '2026-12-20', til: null }; })[0].message, /både en første og en sidste dag/);
});

test('åbningstider', () => {
  assert.match(check(c => { c.global.tider.man = [{ fra: '10', til: '14:00' }]; })[0].message, /skal skrives som 11:30/);
  assert.match(check(c => { c.global.tider.man = [{ fra: '14:00', til: '10:00' }]; })[0].message, /åbne, før I lukker/);
  assert.match(check(c => { c.global.tider.man = [{ fra: '10:00', til: '14:00' }, { fra: '13:00', til: '20:00' }]; })[0].message, /overlapper/);
  assert.match(check(c => { c.global.tider.man = [{ fra: '08:00', til: '09:00' }, { fra: '10:00', til: '11:00' }, { fra: '12:00', til: '13:00' }]; })[0].message, /højst have 2 tidsrum/);
  assert.match(check(c => { delete c.global.tider.tir; })[0].message, /Tirsdag mangler/);
  assert.match(check(c => { c.global.tider.son = []; })[0].detail, /ukendt dag son/);
});

test('priser og valg', () => {
  assert.match(check(c => { c.menu.kategorier[0].retter[0].pris = 45.5; })[0].message, /helt tal/);
  assert.match(check(c => { c.menu.kategorier[0].retter[0].pris = 1000; })[0].message, /mellem 0 og 999/);
  assert.match(check(c => { c.menu.kategorier[0].retter[0].pris = '45'; })[0].message, /helt tal/);
  assert.match(check(c => { c.menu.kategorier[0].retter[0].allergener = ['nuts']; })[0].detail, /"nuts" er ikke et af gluten, egg/);
  assert.match(check(c => { c.menu.kategorier[0].retter[0].allergener = ['egg', 'egg']; })[0].message, /samme valg flere gange/);
});

test('lister', () => {
  const error = check(c => { c.menu.kategorier[0].retter[1].navn.da = ''; })[0];
  assert.equal(error.path, 'menu.kategorier.0.retter.1.navn');
  assert.match(error.message, /"Navn på retten" \(Ret 2 "", dansk\)|"Navn på retten" \(Ret 2, dansk\)/);
  assert.match(check(c => { c.menu.kategorier = []; })[0].message, /mindst 1 i "Menukort"/);
  assert.match(check(c => { c.global.betaling = ['a', 'b', 'c', 'd'].map(da => ({ da, en: da })); })[0].message, /højst være 3 i "Betaling"/);
  assert.match(check(c => { c.menu.kategorier.push(structuredClone(c.menu.kategorier[0])); })[0].detail, /id "kaffe" findes flere gange/);
  assert.equal(check(c => { c.menu.kategorier[0].id = 'Kaffe Latte'; })[0].audience, 'patrick');
  assert.equal(check(c => { c.global.betaling[0].en = 'x'.repeat(21); })[0].path, 'global.betaling.0');
});

test('ukendte felter og felter kun til Patrick', () => {
  const unknown = check(c => { c.forside.hero.overskirft = { da: 'Stavefejl' }; })[0];
  assert.equal(unknown.path, 'forside.hero.overskirft');
  assert.equal(unknown.audience, 'patrick');
  assert.equal(check(c => { c.global.firma = 'Et firmanavn der er for langt'; })[0].audience, 'patrick');
  assert.equal(validateContent({ schema, content: { ...goodContent(), ekstra: {} }, publicDir: dir })[0].message, 'Filen content/ekstra.json står ikke i schema.json.');
  const content = goodContent();
  delete content.menu;
  assert.equal(validateContent({ schema, content, publicDir: dir })[0].message, 'Filen content/menu.json mangler.');
});

test('billeder', () => {
  assert.match(check(c => { c.forside.hero.billede.alt.da = ' '; })[0].message, /mangler en kort beskrivelse/);
  assert.deepEqual(check(c => { delete c.forside.hero.billede.alt.en; }), [], 'engelsk beskrivelse må mangle: siden viser dansk');
  assert.equal(check(c => { c.forside.hero.billede.alt.da = ''; })[0].language, 'da');
  assert.match(check(c => { c.forside.hero.logo.alt = ''; })[0].message, /mangler en kort beskrivelse/);
  assert.match(check(c => { c.forside.hero.billede.src = '/images/findes-ikke.jpg'; })[0].message, /kan ikke findes/);
  assert.match(check(c => { c.forside.hero.billede.src = '/images/hero.gif'; })[0].message, /jpg-, png-, webp- eller avif-billede/);
  assert.match(check(c => { c.forside.hero.billede.src = '/../../etc/passwd.jpg'; })[0].message, /kan ikke findes/);

  const other = publicDir({ 'images/hero.jpg': jpeg(800, 800), 'images/small.jpg': jpeg(200, 150), 'images/big.png': png(400, 300, 600 * 1024) });
  assert.match(check(() => {}, { publicDir: other })[0].message, /ikke det rigtige format/);
  assert.match(check(c => { c.forside.hero.billede.src = '/images/small.jpg'; }, { publicDir: other })[0].message, /for lille/);
  assert.match(check(c => { c.forside.hero.billede.src = '/images/big.png'; }, { publicDir: other })[0].message, /fylder 600 KB\. Det må højst fylde 500 KB/);
});

test('uden publicDir tjekkes billedfiler ikke', () => {
  const content = goodContent();
  content.forside.hero.billede.src = '/images/findes-ikke.jpg';
  assert.deepEqual(validateContent({ schema, content }), []);
});

test('validateField og findField', () => {
  assert.deepEqual(validateField(schema, 'menu.kategorier.0.retter.1.pris', 50), []);
  const [error] = validateField(schema, 'menu.kategorier.0.retter.1.pris', -5);
  assert.equal(error.path, 'menu.kategorier.0.retter.1.pris');
  assert.match(error.message, /"Pris" \(Ret 2\)/);
  assert.equal(validateField(schema, 'forside.hero.overskrift', { da: 'Hej', en: '' }).length, 0, 'tom engelsk tekst: siden viser dansk');
  assert.equal(validateField(schema, 'forside.hero.overskrift', { da: '', en: 'Hi' }).length, 1);
  assert.equal(validateField(schema, 'global.betaling.0', { da: 'Kort', en: 'Card' }).length, 0);
  assert.match(validateField(schema, 'forside.findes.ikke', 'x')[0].detail, /står ikke i schema.json/);
  assert.equal(findField(schema, 'menu.kategorier.x.navn'), null);
  assert.equal(findField(schema, 'forside.hero.billede').field.type, 'image');
});

test('imageSources finder alle billeder', () => {
  assert.deepEqual(imageSources(schema, goodContent()).sort(), ['/images/hero.jpg', '/images/logo.png']);
});

test('til og fra (toggle)', () => {
  const schema = { version: 1, languages: ['da'], files: { side: { fields: { vis: { type: 'toggle', label: 'Vis billederne' } } } } };
  assert.deepEqual(validateContent({ schema, content: { side: { vis: false } } }), []);
  assert.match(validateContent({ schema, content: { side: { vis: 'ja' } } })[0].message, /slået til eller fra/);
});

test('valgfrit billede må mangle', () => {
  const schema = { version: 1, languages: ['da'], files: { side: { fields: { billede: { type: 'image', label: 'Billede', image: { width: 4, height: 3 }, alt: {} } } } } };
  assert.deepEqual(validateContent({ schema, content: { side: {} } }), []);
  assert.deepEqual(validateContent({ schema, content: { side: { billede: null } } }), []);
  schema.files.side.fields.billede.required = true;
  assert.match(validateContent({ schema, content: { side: {} } })[0].message, /Vælg et billede/);
});
