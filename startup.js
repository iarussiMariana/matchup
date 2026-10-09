(() => {
  'use strict';
  const intro = document.getElementById('startupIntro');
  const video = document.getElementById('startupVideo');
  const skip = document.getElementById('skipStartup');
  const seenKey = 'matchup:intro-shown:v1';
  if (!intro || !video || !skip || typeof intro.showModal !== 'function') return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const parameters = [new URLSearchParams(location.search), new URLSearchParams(location.hash.slice(1))];
  const authLink = parameters.some(params => ['code', 'type', 'token', 'token_hash', 'access_token', 'refresh_token', 'error', 'error_code', 'error_description'].some(key => params.has(key)));
  let seen = false;
  try { seen = sessionStorage.getItem(seenKey) === '1'; } catch { /* Storage may be unavailable in private/restricted contexts. */ }
  if (seen || authLink || motion.matches || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '') || !navigator.onLine || document.hidden) return;

  let finished = false;
  let startupTimer;
  let totalTimer;
  const events = new AbortController();
  const listen = (target, name, listener) => target?.addEventListener(name, listener, { signal: events.signal });
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(startupTimer);
    clearTimeout(totalTimer);
    events.abort();
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (intro.open) intro.close();
    if (!document.hidden && !document.querySelector('dialog[open]')) document.getElementById('main')?.focus({ preventScroll: true });
  }

  listen(skip, 'click', finish);
  listen(intro, 'cancel', event => { event.preventDefault(); finish(); });
  listen(intro, 'close', finish);
  listen(video, 'ended', finish);
  listen(video, 'error', finish);
  listen(video, 'playing', () => clearTimeout(startupTimer));
  listen(motion, 'change', () => { if (motion.matches) finish(); });
  listen(connection, 'change', () => { if (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || '')) finish(); });
  listen(window, 'offline', finish);
  listen(window, 'pagehide', finish);
  listen(document, 'visibilitychange', () => { if (document.hidden) finish(); });

  try {
    intro.showModal();
    skip.focus({ preventScroll: true });
    try { sessionStorage.setItem(seenKey, '1'); } catch { /* One attempt per document if session storage is blocked. */ }
    // Media is optional: never hold authentication or the application behind buffering.
    startupTimer = setTimeout(finish, 2000);
    totalTimer = setTimeout(finish, 12000);
    video.muted = true;
    video.defaultMuted = true;
    video.src = 'assets/brand/matchup-intro.mp4';
    video.play()?.catch(finish);
  } catch { finish(); }
})();
