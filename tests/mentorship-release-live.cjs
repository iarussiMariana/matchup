'use strict';
// Read-only, opt-in verification of the approved HTTPS deployment and its public offline shell.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium, webkit } = require('@playwright/test');
const { root, assets, shellAssets, serviceWorker } = require('../tools/web-assets.cjs');
async function run() {
  const site = process.env.SPARK_LIVE_URL || 'https://matchup-87k.pages.dev/';
  assert.ok(/^https:\/\/(?:[a-f0-9]+\.)?matchup-87k\.pages\.dev\/?$/.test(site), 'Only the approved deployment may be verified');
  const base = new URL(site.endsWith('/') ? site : `${site}/`);
  const names = [...assets, 'sw.js'];
  const mime = { '.html': /text\/html/, '.css': /text\/css/, '.js': /(?:javascript|ecmascript)/, '.png': /image\/png/, '.mp4': /video\/mp4/, '.webmanifest': /(?:manifest\+json|application\/json)/ };
  const hash = value => createHash('sha256').update(value).digest('hex');
  assert.equal(fs.readFileSync(path.join(root, 'www', 'sw.js'), 'utf8'), serviceWorker(), 'Build must match current sources');
  for (const name of names) {
    const expected = fs.readFileSync(path.join(root, 'www', ...name.split('/')));
    if (name !== 'sw.js') assert.equal(hash(expected), hash(fs.readFileSync(path.join(root, ...name.split('/')))), `Source/build drift: ${name}`);
    const response = await fetch(new URL(name, base), { cache: 'no-store' });
    assert.equal(response.status, 200, `Published asset: ${name}`);
    assert.match(response.headers.get('content-type') || '', mime[path.extname(name)], `Published MIME: ${name}`);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(expected), `Published bytes: ${name}`);
  }
  const media = fs.readFileSync(path.join(root, 'www', 'assets', 'brand', 'matchup-intro.mp4'));
  const range = await fetch(new URL('assets/brand/matchup-intro.mp4', base), { headers: { Range: 'bytes=0-255' } });
  assert.ok([200, 206].includes(range.status), 'Video range request must return full media or a valid partial response');
  if (range.status === 206) assert.equal(range.headers.get('content-range'), `bytes 0-255/${media.length}`);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), range.status === 206 ? media.subarray(0, 256) : media);
  console.log(`PASS: ${names.length} published assets match sources/build byte-for-byte and have correct MIME types; media Range request returned ${range.status === 206 ? '206 partial bytes' : '200 full-file fallback'}.`);
  const expectedCache = serviceWorker().match(/const CACHE = '([^']+)'/)[1];
  for (const [engine, launch] of [['Chrome', () => chromium.launch({ channel: 'chrome' })], ['WebKit', () => webkit.launch()]]) {
    const browser = await launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.name));
      await page.addInitScript(() => {
        document.addEventListener('playing', event => {
          if (event.target.id === 'startupVideo') window.__introPlayed = event.target.muted && event.target.playsInline;
        }, true);
      });
      await page.goto(base.href);
      await page.locator('#startupIntro').waitFor({ state: 'hidden', timeout: 14000 });
      await page.getByRole('button', { name: 'Entrar no MatchUp', exact: true }).waitFor();
      if (engine === 'Chrome') assert.equal(await page.evaluate(() => window.__introPlayed), true, 'Published intro played silently inline');
      assert.equal(await page.locator('#startupIntro').evaluate(dialog => dialog.open), false);
      assert.equal(await page.locator('#startupVideo').getAttribute('src'), null);
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      assert.equal(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL), new URL('sw.js', base).href);
      const cached = await page.evaluate(async cacheName => {
        const keys = await caches.keys(), cache = await caches.open(cacheName);
        return { keys, urls: (await cache.keys()).map(request => request.url).sort() };
      }, expectedCache);
      assert.deepEqual(cached.keys.filter(name => name.startsWith('matchup-static-')), [expectedCache]);
      assert.deepEqual(cached.urls, shellAssets.map(name => new URL(name, base).href).sort());
      // This Windows WebKit build rejects offline navigation even with a minimal always-response worker.
      // Check its controlled online reload/cache, but do not report Safari offline behavior as verified.
      if (engine === 'Chrome') await context.setOffline(true);
      await page.reload();
      await page.getByRole('button', { name: 'Entrar no MatchUp', exact: true }).waitFor();
      assert.equal(await page.title(), 'MatchUp — Conexões acadêmicas que funcionam');
      assert.deepEqual(errors, []);
      console.log(`PASS: ${engine} HTTPS startup, current service worker, allowlisted static-only cache and ${engine === 'Chrome' ? 'offline' : 'controlled online'} shell reload.`);
      if (engine === 'WebKit') console.log('LIMITATION: WebKit offline navigation is not asserted on this runner; Safari offline behavior still requires a physical device.');
    } finally { await browser.close(); }
  }
}
if (process.argv.includes('--run')) run().catch(error => { console.error('Live release verification failed:', error.message); process.exitCode = 1; });
else console.log('Read-only opt-in verification: node tests\\mentorship-release-live.cjs --run');
