'use strict';
const CACHE = 'matchup-static-__MATCHUP_VERSION__';
const FILES = __MATCHUP_ASSETS__;
const urls = FILES.map(file => new URL(file, self.registration.scope).href);
const allowed = new Set(urls);
const shell = new URL('index.html', self.registration.scope).href;
const home = new URL('./', self.registration.scope).pathname;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls.map(url => new Request(url, {cache:'reload', credentials:'omit'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('matchup-static-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'MATCHUP_ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization')) return;
  // Navigation queries may contain recovery tokens. Never store the response or URL.
  if (request.mode === 'navigate' && (url.pathname === home || url.pathname === new URL(shell).pathname)) {
    // Static hosts may redirect index.html; navigation fallback needs a non-redirected response.
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match(shell)).then(cached => cached && new Response(cached.body, {status:cached.status, statusText:cached.statusText, headers:cached.headers}))));
    return;
  }
  // Only the explicit, public application shell is cached, never API or user data.
  if (url.search || !allowed.has(url.href)) return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(url.href)).then(cached => cached || fetch(request)));
});
