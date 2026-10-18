import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSite, checkImages, imageSize, formatErrors, githubAnnotations, githubSummary } from '../src/index.js';
import { tempDir, png, jpeg } from './helpers.js';

const page = body => `<!doctype html><html><head><link rel="stylesheet" href="/style.css"><link rel="canonical" href="https://kunde.dk/"></head><body>${body}</body></html>`;
const site = (files) => tempDir({ 'style.css': '', 'menu.html': page('<h2 id="priser">Priser</h2>'), 'img/a.jpg': jpeg(10, 10), ...files });

test('en god side giver ingen fejl', () => {
  const dir = site({ 'index.html': page('<a href="#top" id="top">Top</a><a href="/menu.html#priser">Priser</a><a href="/menu">Menu</a><a href="menu.html">Menu</a><a href="#">Til toppen</a><a href="https://www.facebook.com/x">FB</a><a href="tel:+4512345678">Ring</a><a href="mailto:a@b.dk">Mail</a><img src="/img/a.jpg" alt="Et billede">') });
  assert.deepEqual(checkSite({ distDir: dir }), []);
});

test('billeder uden alt-tekst', () => {
  const dir = site({ 'index.html': page('<img src="/img/a.jpg"><img src="/img/a.jpg" alt=""><img src="/img/a.jpg" alt="ok">') });
  const errors = checkSite({ distDir: dir });
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /mangler en beskrivelse \(alt-tekst\)/);
  assert.equal(errors[0].file, 'dist/index.html');
  assert.equal(errors[0].audience, 'patrick');
});

test('døde interne links og ankre', () => {
  const dir = site({ 'index.html': page('<a href="/menu.htm">x</a><a href="/menu.html#vin">x</a><a href="#findes-ikke">x</a><img src="/img/b.jpg" alt="b">') });
  const messages = checkSite({ distDir: dir }).map(error => error.message);
  assert.equal(messages.length, 4);
  assert.match(messages[0], /Linket til \/menu\.htm .* virker ikke/);
  assert.match(messages[1], /peger på et sted på siden, der ikke findes/);
  assert.match(messages[2], /#findes-ikke/);
  assert.match(messages[3], /\/img\/b\.jpg/);
});

test('eksterne scripts, iframes og skrifttyper blokeres', () => {
  const dir = site({ 'index.html': page('<script src="https://cdn.example.com/x.js"></script><iframe src="https://www.youtube.com/embed/x"></iframe><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">') });
  const messages = checkSite({ distDir: dir }).map(error => error.message);
  assert.equal(messages.length, 3);
  assert.match(messages[0], /henter en fil fra cdn\.example\.com/);
  assert.match(messages[1], /www\.youtube\.com/);
  assert.match(messages[2], /fonts\.googleapis\.com/);
  assert.deepEqual(checkSite({ distDir: dir, allowedHosts: ['cdn.example.com', 'www.youtube.com', 'fonts.googleapis.com'] }), []);
});

test('sporingsscripts findes i HTML og JavaScript', () => {
  const dir = site({
    'index.html': page('<script>fbq("init", "123")</script>'),
    'app.js': 'window.dataLayer = []; function gtag(){ dataLayer.push(arguments); } gtag("config", "G-X");'
  });
  const messages = checkSite({ distDir: dir }).map(error => error.message);
  assert.ok(messages.some(m => m.includes('Meta Pixel')), messages.join('\n'));
  assert.ok(messages.some(m => m.includes('Google Analytics')), messages.join('\n'));
  assert.ok(messages.every(m => m.includes('cookiemodulet')));
});

test('almindelig tekst om Facebook er ikke sporing', () => {
  const dir = site({ 'index.html': page('<p>Følg os på Facebook og Google Maps.</p>'), 'app.js': 'const text = "Facebook";' });
  assert.deepEqual(checkSite({ distDir: dir }), []);
});

test('checkImages: størrelse, filtype og skip', () => {
  const dir = tempDir({ 'images/ok.png': png(10, 10), 'images/stor.png': png(10, 10, 501 * 1024), 'images/gammel.gif': 'GIF89a', 'style.css': '' });
  const errors = checkImages({ publicDir: dir });
  assert.equal(errors.length, 2);
  assert.ok(errors.some(e => /\/images\/stor\.png fylder \d+ KB\. Det må højst fylde 500 KB/.test(e.message)));
  assert.ok(errors.some(e => /\/images\/gammel\.gif skal være jpg, png, webp eller avif/.test(e.message)));
  assert.equal(checkImages({ publicDir: dir, skip: ['/images/stor.png', '/images/gammel.gif'] }).length, 0);
});

test('imageSize læser JPEG, PNG og WebP', () => {
  assert.deepEqual(imageSize(jpeg(764, 566)), { width: 764, height: 566 });
  assert.deepEqual(imageSize(png(1200, 800)), { width: 1200, height: 800 });
  const webp = Buffer.alloc(30);
  webp.write('RIFF', 0, 'ascii'); webp.write('WEBP', 8, 'ascii'); webp.write('VP8X', 12, 'ascii');
  webp.writeUIntLE(799, 24, 3); webp.writeUIntLE(599, 27, 3);
  assert.deepEqual(imageSize(webp), { width: 800, height: 600 });
  assert.equal(imageSize(Buffer.from('ikke et billede, bare tekst her')), null);
});

test('formatering til terminal og GitHub', () => {
  const errors = [
    { path: 'forside.hero.overskrift', audience: 'kunde', message: 'Teksten er for lang.', detail: 'a: b, c', file: 'content/forside.json' },
    { path: null, audience: 'patrick', message: 'Et link virker ikke.', detail: 'x', file: 'dist/index.html' }
  ];
  const text = formatErrors(errors);
  assert.match(text, /Siden blev ikke udgivet\. Kvalitetstjekket fandt 2 fejl/);
  assert.match(text, /Ret dette i editoren:\n {2}- Teksten er for lang\./);
  assert.match(text, /Ret dette i koden \(Patrick\):/);
  assert.equal(formatErrors([]), 'Kvalitetstjekket er bestået.');
  const annotations = githubAnnotations(errors).split('\n');
  assert.equal(annotations[0], '::error file=content/forside.json,title=Kvalitetstjek%3A forside.hero.overskrift::Teksten er for lang. (a: b, c)');
  assert.match(githubSummary(errors), /\| Kunden \| Teksten er for lang\. \| `forside.hero.overskrift` \|/);
  assert.match(githubSummary([]), /Bestået/);
});
