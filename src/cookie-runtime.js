// Fælles browserkode. Byggescriptet kopierer kun denne fil, når modulet er slået til.
(function () {
  'use strict';
  const node = document.getElementById('benzoni-cookie-config');
  if (!node) return;
  let config;
  try { config = JSON.parse(node.textContent); } catch { return; }
  if (!config.aktiv) return;
  const buttons = document.querySelectorAll('[data-cookie-settings]');
  const announce = text => {
    let el = document.getElementById('benzoni-cookie-status');
    if (!el) { el = document.createElement('p'); el.id = 'benzoni-cookie-status'; el.setAttribute('role', 'status'); buttons[0]?.after(el); }
    el.textContent = text;
  };
  // Ingen samtykkeleverandør eller måling i iframes, heller ikke ved redigering.
  if (window.top !== window.self) {
    buttons.forEach(button => button.addEventListener('click', () => announce('Cookievalg vises på den offentlige side.')));
    return;
  }
  let previous = { statistics: false, marketing: false };
  let stopping = false;
  let googleLoaded = false;
  let analyticsLoaded = false;
  let adsLoaded = false;
  let metaLoaded = false;
  const append = (src, attrs = {}, parent = document.head) => {
    const script = document.createElement('script');
    script.src = src; script.async = true;
    for (const [key, value] of Object.entries(attrs)) script.setAttribute(key, value);
    parent.appendChild(script);
    return script;
  };
  function deleteCookies(statistics, marketing) {
    const names = document.cookie.split(';').map(part => part.split('=')[0].trim()).filter(name =>
      (statistics && /^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) ||
      (marketing && /^_gcl_|^_fbp$|^_fbc$/.test(name)));
    const domains = ['', ...location.hostname.split('.').map((_, i, parts) => parts.slice(i).join('.')).filter(d => d.includes('.'))];
    const paths = ['/', ...location.pathname.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/')).filter(Boolean)];
    for (const name of names) for (const domain of domains) for (const path of paths) {
      document.cookie = `${name}=; Max-Age=0; path=${path}${domain ? `; domain=${domain}` : ''}; SameSite=Lax`;
    }
  }
  function update() {
    const cmp = window.Cookiebot;
    if (stopping || !cmp?.hasResponse) return;
    const consent = { statistics: cmp.consent?.statistics === true, marketing: cmp.consent?.marketing === true };
    if ((previous.statistics && !consent.statistics) || (previous.marketing && !consent.marketing)) {
      stopping = true;
      // En ny side starter uden de fravalgte scripts. Send ingen cookiefri afvisningsmåling.
      if (config.googleAnalyticsId) window[`ga-disable-${config.googleAnalyticsId}`] = true;
      if (window.fbq) window.fbq('consent', 'revoke');
      window.dataLayer = [];
      window.gtag = function () {};
      deleteCookies(!consent.statistics, !consent.marketing);
      location.reload();
      return;
    }
    previous = consent;
    const analytics = consent.statistics && config.googleAnalyticsId;
    const ads = consent.marketing && config.googleAdsId;
    if (analytics || ads) {
      if (!googleLoaded) {
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
        window.gtag('js', new Date());
      }
      window.gtag('consent', 'update', {
        analytics_storage: consent.statistics ? 'granted' : 'denied',
        ad_storage: consent.marketing ? 'granted' : 'denied',
        ad_user_data: consent.marketing ? 'granted' : 'denied',
        ad_personalization: consent.marketing ? 'granted' : 'denied'
      });
      if (analytics && !analyticsLoaded) {
        analyticsLoaded = true;
        window.gtag('config', config.googleAnalyticsId, { allow_google_signals: false, allow_ad_personalization_signals: false });
      }
      if (ads && !adsLoaded) { adsLoaded = true; window.gtag('config', config.googleAdsId); }
      if (!googleLoaded) {
        googleLoaded = true;
        append('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(analytics || ads));
      }
    }
    if (consent.marketing && config.metaPixelId && !metaLoaded) {
      metaLoaded = true;
      const fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
      fbq.queue = []; fbq.loaded = true; fbq.version = '2.0'; fbq.push = fbq;
      window.fbq = fbq; window._fbq = fbq;
      fbq('consent', 'grant');
      fbq('set', 'autoConfig', false, config.metaPixelId);
      fbq('init', config.metaPixelId);
      fbq('track', 'PageView');
      append('https://connect.facebook.net/en_US/fbevents.js');
    }
  }
  for (const event of ['CookiebotOnConsentReady', 'CookiebotOnAccept', 'CookiebotOnDecline']) window.addEventListener(event, update);
  buttons.forEach(button => button.addEventListener('click', () => {
    if (window.Cookiebot?.renew) window.Cookiebot.renew();
    else announce('Cookievalg kan ikke åbnes lige nu. Statistik og marketing er slået fra.');
  }));
  const cmp = append('https://consent.cookiebot.com/uc.js', {
    id: 'Cookiebot', 'data-cbid': config.samtykkeId, 'data-blockingmode': 'none', 'data-consentmode': 'disabled',
    'data-culture': ['da', 'en', 'de'].includes(document.documentElement.lang) ? document.documentElement.lang.toUpperCase() : 'DA'
  });
  cmp.addEventListener('error', () => announce('Cookievalg kunne ikke hentes. Statistik og marketing er slået fra.'));
  // Leverandørens deklaration indeholder også den løbende cookieoversigt.
  const declaration = document.getElementById('benzoni-cookie-declaration');
  if (declaration) append('https://consent.cookiebot.com/' + config.samtykkeId + '/cd.js', { id: 'CookieDeclaration' }, declaration);
})();
