// Tjekker den færdige side i dist/: alt-tekster, døde interne links og sporingsscripts.

import fs from 'node:fs';
import path from 'node:path';

// Kendte sporingstjenester. De må kun komme ind via cookiemodulet (Fase 6).
export const TRACKERS = [
  { name: 'Google Analytics / Tag Manager', pattern: /googletagmanager\.com|google-analytics\.com|\bgtag\s*\(|\bdataLayer\s*\.push/ },
  { name: 'Google Ads', pattern: /googleadservices\.com|googlesyndication\.com|doubleclick\.net/ },
  { name: 'Meta Pixel', pattern: /connect\.facebook\.net|\bfbq\s*\(/ },
  { name: 'Hotjar', pattern: /hotjar\.com|\bhj\s*\(\s*['"]/ },
  { name: 'Microsoft Clarity', pattern: /clarity\.ms/ },
  { name: 'TikTok Pixel', pattern: /analytics\.tiktok\.com|\bttq\s*\.\s*(load|page|track)/ },
  { name: 'LinkedIn Insight', pattern: /snap\.licdn\.com|_linkedin_partner_id/ },
  { name: 'Snapchat Pixel', pattern: /sc-static\.net|\bsnaptr\s*\(/ },
  { name: 'Pinterest Tag', pattern: /s\.pinimg\.com\/ct|\bpintrk\s*\(/ },
  { name: 'Bing Ads', pattern: /bat\.bing\.com/ }
];

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(2).find(v => v !== undefined);
const ids = html => new Set([...html.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]));

// Finder filen bag en intern adresse som "/menu.html", "/" eller "billede.jpg".
function resolveTarget(distDir, fromFile, url) {
  const clean = url.split('#')[0].split('?')[0];
  if (!clean) return fromFile;
  const base = clean.startsWith('/') ? distDir : path.dirname(fromFile);
  const target = path.resolve(base, `.${clean.startsWith('/') ? clean : `/${clean}`}`);
  if (!target.startsWith(path.resolve(distDir))) return null;
  const candidates = clean.endsWith('/') ? [path.join(target, 'index.html')] : [target, `${target}.html`, path.join(target, 'index.html')];
  return candidates.find(file => fs.existsSync(file) && fs.statSync(file).isFile()) || null;
}

export function checkSite({ distDir, allowedHosts = [] }) {
  const errors = [];
  const files = listFiles(distDir);
  const htmlFiles = files.filter(file => file.endsWith('.html'));
  const idCache = new Map();
  const idsOf = file => {
    if (!idCache.has(file)) idCache.set(file, ids(fs.readFileSync(file, 'utf8')));
    return idCache.get(file);
  };
  const push = (file, message, detail) => errors.push({ path: null, audience: 'patrick', message, detail, file: `dist/${path.relative(distDir, file).split(path.sep).join('/')}` });

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    const page = `/${path.relative(distDir, file).split(path.sep).join('/')}`;

    // Alt-tekster
    for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
      const alt = attr(tag, 'alt');
      if (alt === undefined || !alt.trim()) push(file, `Et billede på ${page} mangler en beskrivelse (alt-tekst).`, `${tag.slice(0, 120)}`);
    }

    // Interne links og filer
    for (const [tag] of html.matchAll(/<[a-z][^>]*\s(?:href|src)\s*=[^>]*>/gi)) {
      for (const name of ['href', 'src']) {
        const url = attr(tag, name);
        if (url === undefined || url === '' || url === '#') continue;
        if (/^(https?:)?\/\//i.test(url)) {
          const host = new URL(url, 'https://x').hostname;
          const isResource = /^<(script|iframe|link|img|source|video|audio|embed|object)\b/i.test(tag) && !/^<link\b[^>]*rel\s*=\s*["']?(canonical|alternate)/i.test(tag);
          if (isResource && !allowedHosts.includes(host)) push(file, `${page} henter en fil fra ${host}. Det kan sende de besøgendes data videre og er kun tilladt via cookiemodulet.`, tag.slice(0, 160));
          continue;
        }
        if (/^(mailto:|tel:|data:)/i.test(url)) continue;
        if (/^javascript:/i.test(url)) { push(file, `${page} har et link med JavaScript i stedet for en adresse.`, tag.slice(0, 160)); continue; }
        const target = resolveTarget(distDir, file, url);
        if (!target) { push(file, `Linket til ${url} på ${page} virker ikke. Siden eller filen findes ikke.`, tag.slice(0, 160)); continue; }
        const anchor = url.includes('#') ? url.split('#')[1] : '';
        if (anchor && target.endsWith('.html') && !idsOf(target).has(decodeURIComponent(anchor))) {
          push(file, `Linket til ${url} på ${page} peger på et sted på siden, der ikke findes.`, `id="${anchor}" findes ikke i ${path.basename(target)}`);
        }
      }
    }
  }

  // Sporingsscripts i HTML og JavaScript
  for (const file of files.filter(f => /\.(html|js|mjs)$/.test(f))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const tracker of TRACKERS) {
      if (tracker.pattern.test(text)) push(file, `Siden indeholder ${tracker.name} uden om cookiemodulet. Sporing må kun tilføjes via cookiemodulet.`, `fundet i ${path.basename(file)}: ${tracker.pattern}`);
    }
  }
  return errors;
}
