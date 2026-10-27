// Cookiemodulets eneste indgang. ID'er er offentlige installations-ID'er, aldrig hemmelige nøgler.
import source from './cookie-runtime-source.js';
export const cookieRuntime = source;
export const COOKIE_FILE = 'benzoni-cookies.js';
const keys = ['aktiv', 'loesning', 'samtykkeId', 'googleAnalyticsId', 'googleAdsId', 'metaPixelId'];
const patterns = {
  samtykkeId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  googleAnalyticsId: /^G-[A-Z0-9]{4,20}$/,
  googleAdsId: /^AW-\d{5,20}$/,
  metaPixelId: /^\d{5,25}$/
};
export const defaultCookies = () => ({ aktiv: false, loesning: 'cookiebot', samtykkeId: '', googleAnalyticsId: '', googleAdsId: '', metaPixelId: '' });
export function validateCookies(config) {
  if (config == null) return [];
  const errors = [];
  const fail = (key, message) => errors.push({ path: 'global.cookies' + (key ? '.' + key : ''), audience: 'patrick', message, detail: message, file: 'content/global.json' });
  if (typeof config !== 'object' || Array.isArray(config)) { fail('', 'Cookieopsætningen skal være et objekt.'); return errors; }
  for (const key of Object.keys(config)) if (!keys.includes(key)) fail(key, `Cookieopsætningen har et ukendt felt: ${key}.`);
  // {} fra tidligere versioner betyder fortsat, at modulet er slået fra.
  if ('aktiv' in config && typeof config.aktiv !== 'boolean') fail('aktiv', 'Vælg til eller fra for cookiemodulet.');
  if (config.loesning !== undefined && config.loesning !== 'cookiebot') fail('loesning', 'Cookiemodulet understøtter Cookiebot.');
  for (const [key, pattern] of Object.entries(patterns)) {
    const value = config[key];
    if (value !== undefined && (typeof value !== 'string' || (value !== '' && !pattern.test(value)))) fail(key, `ID'et i cookieopsætningen (${key}) har ikke den rigtige form.`);
  }
  if (config.aktiv === true && (!config.samtykkeId || !patterns.samtykkeId.test(config.samtykkeId))) fail('samtykkeId', 'Udfyld Cookiebots domæne-ID, før cookiemodulet slås til.');
  if (config.aktiv === true && config.loesning !== 'cookiebot') fail('loesning', 'Vælg Cookiebot, før cookiemodulet slås til.');
  return errors;
}
export function cookieAssets(config) {
  const errors = validateCookies(config);
  if (errors.length) throw new Error(errors.map(e => e.message).join(' '));
  if (!config?.aktiv) return { head: '', settings: '', files: {} };
  const json = JSON.stringify({ ...defaultCookies(), ...config }).replace(/</g, '\\u003c');
  return {
    head: `<script id="benzoni-cookie-config" type="application/json">${json}</script><script src="/${COOKIE_FILE}" defer></script>`,
    settings: '<button type="button" class="cookie-settings" data-cookie-settings>Cookieindstillinger</button>',
    files: { [COOKIE_FILE]: cookieRuntime }
  };
}
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function privacySection(config) {
  const services = [];
  const policies = ['<a href="https://www.cookiebot.com/en/privacy-policy/">Cookiebot</a>'];
  if (config?.aktiv && (config.googleAnalyticsId || config.googleAdsId)) policies.push('<a href="https://policies.google.com/privacy">Google</a>');
  if (config?.aktiv && config.metaPixelId) policies.push('<a href="https://www.facebook.com/privacy/policy/">Meta</a>');
  if (config?.aktiv && config.googleAnalyticsId) services.push('<li>Google Analytics bruges til statistik, når du vælger statistik.</li>');
  if (config?.aktiv && config.metaPixelId) services.push('<li>Meta Pixel bruges til marketing, når du vælger marketing.</li>');
  if (config?.aktiv && config.googleAdsId) services.push('<li>Google Ads bruges til marketing, når du vælger marketing.</li>');
  if (!config?.aktiv) return '<h2>Cookies og måling</h2><p>Denne hjemmeside bruger ikke cookies til statistik eller marketing.</p>';
  return '<h2>Cookies og måling</h2><p>Cookiebot fra Usercentrics håndterer dine valg og gemmer dokumentation for samtykket. Dit valg kan huskes med en nødvendig cookie, også når du afviser.</p>' +
    (services.length ? '<ul>' + services.join('') + '</ul>' : '<p>Der er ingen statistik- eller marketingtjenester slået til.</p>') +
    '<p>Du kan til enhver tid ændre dit valg via Cookieindstillinger nederst på siden. Det er lige så let at afvise som at acceptere. Siden virker også, hvis du afviser.</p>' +
    '<p>De valgte tjenester leveres af eksterne virksomheder. Oplysninger kan blive behandlet uden for EU. Læs om deres behandling og dine rettigheder hos ' + policies.join(', ') + '.</p>' +
    '<h2>Oversigt over cookies</h2><div id="benzoni-cookie-declaration"></div>';
}
export function privacyPage(global, config, assets = cookieAssets(config)) {
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Privatliv | ${esc(global.virksomhed.navn)}</title><link rel="stylesheet" href="/style.css">${assets.head}</head><body><header class="top"><a class="brand" href="/">${esc(global.virksomhed.navn)}</a></header><main class="section privacy-page" id="main"><h1>Privatliv og cookies</h1><p>${esc(global.virksomhed.navn)} står for denne hjemmeside. Har du spørgsmål om dine oplysninger, kan du kontakte os på <a href="tel:${esc(global.kontakt.telefon.replace(/[^+0-9]/g,''))}">${esc(global.kontakt.telefon)}</a>.</p><p>Hjemmesiden har ingen kontaktformular og beder ikke om dine oplysninger. Hvis du ringer til os, bruger vi de oplysninger, du giver, til at besvare din henvendelse.</p>${privacySection(config)}<h2>Dine rettigheder</h2><p>Kontakt os, hvis du vil vide, hvilke oplysninger vi har om dig, eller ønsker at få dem rettet eller slettet. Du kan også klage til Datatilsynet på <a href="https://www.datatilsynet.dk/">datatilsynet.dk</a>.</p><p>Vercel leverer hjemmesiden. Når du åbner en side, modtager tjenesten tekniske oplysninger, herunder din IP-adresse, for at sende siden til dig og beskytte den mod misbrug.</p></main><footer><a href="/">Til forsiden</a>${assets.settings}</footer></body></html>`;
}
