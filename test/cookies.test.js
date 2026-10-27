import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultCookies, cookieAssets, validateCookies, privacySection, checkSite } from '../src/index.js';
import { tempDir } from './helpers.js';
const config = (extra = {}) => ({ ...defaultCookies(), aktiv: true, samtykkeId: '11111111-1111-4111-8111-111111111111', googleAnalyticsId: 'G-TEST1234', metaPixelId: '1234567890', ...extra });
const site = c => {
 const assets = cookieAssets(c);
 const html = `<!doctype html><html><head>${assets.head}</head><body>${assets.settings}</body></html>`;
 return tempDir({ 'index.html': html, 'menu.html': html, ...assets.files });
};
test('modulet fra leverer hverken scripts eller en indstillingsknap, også med gemte IDer', () => {
 assert.deepEqual(cookieAssets(config({aktiv:false})),{head:'',settings:'',files:{}});
 assert.deepEqual(cookieAssets({}),{head:'',settings:'',files:{}});
 assert.deepEqual(checkSite({distDir:site(config({aktiv:false})),cookies:config({aktiv:false})}),[]);
});
test('opsætning og IDer valideres, ingen fri kode', () => {
 for(const c of [config({samtykkeId:''}),config({googleAnalyticsId:'G-123<script>'}),config({metaPixelId:123}),config({loesning:'andet'}),config({script:'alert(1)'}),{aktiv:'false'}]) assert.ok(validateCookies(c).length, JSON.stringify(c));
 assert.deepEqual(validateCookies(config()),[]);
});
test('kun den præcise genererede browserkode godkendes', () => {
 const c=config();const dir=site(c);
 assert.deepEqual(checkSite({distDir:dir,cookies:c}),[]);
 fs.appendFileSync(dir+'/benzoni-cookies.js','\nfbq("track","Lead");');
 assert.ok(checkSite({distDir:dir,cookies:c}).some(e=>/ændret/.test(e.message)));
 assert.ok(checkSite({distDir:dir,cookies:c}).some(e=>/Meta Pixel/.test(e.message)));
});
test('ekstra trackers og ekstern kode afvises, også når modulet er slået til', () => {
 const c=config();const dir=site(c);
 fs.appendFileSync(dir+'/index.html','<script src="https://www.googletagmanager.com/gtag/js?id=G-ANDEN"></script><script>fbq("init","99999")</script>');
 const errors=checkSite({distDir:dir,cookies:c});
 assert.ok(errors.some(e=>/henter en fil/.test(e.message)));
 assert.ok(errors.some(e=>/Meta Pixel/.test(e.message)));
});
test('browserkode uden aktivt modul og dobbelt installation afvises',()=>{
 const c=config();const dir=site(c);
 assert.ok(checkSite({distDir:dir,cookies:{}}).length);
 fs.appendFileSync(dir+'/index.html',cookieAssets(c).head);
 assert.ok(checkSite({distDir:dir,cookies:c}).some(e=>/flere gange/.test(e.message)));
});
test('opsætningen skal stemme med de valgte IDer på hver side',()=>{
 const c=config();const dir=site(c);
 assert.ok(checkSite({distDir:dir,cookies:config({googleAnalyticsId:'G-ANDEN123'})}).some(e=>/opsætning/.test(e.message)));
 fs.writeFileSync(dir+'/menu.html','<html><body>Menu</body></html>');
 assert.ok(checkSite({distDir:dir,cookies:c}).some(e=>/opsætning/.test(e.message)));
});
test('privatlivsteksten følger de aktiverede tjenester',()=>{
 assert.ok(!privacySection({aktiv:false}).includes('Meta Pixel'));
 const text=privacySection(config({metaPixelId:'',googleAdsId:''}));
 assert.ok(text.includes('Google Analytics'));assert.ok(!text.includes('Meta Pixel'));assert.ok(!text.includes('Google Ads bruges'));
});
