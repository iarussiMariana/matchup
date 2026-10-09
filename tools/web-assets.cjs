const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const assets = [
  'index.html', 'mentorship.js', 'mentorship.css', 'mentorship-academic.js', 'mentorship-academic.css',
  'mentorship-catalog.js', 'mentorship-catalog.css', 'mentorship-product.js', 'mentorship-calendar.js',
  'vendor/supabase.js', 'pwa.js', 'pwa.css', 'manifest.webmanifest', 'startup.js', 'startup.css', 'assets/brand/matchup-intro.mp4',
  ...['matchup-symbol.png', 'matchup-logo.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'].map(name => 'assets/brand/' + name),
];
// The optional video must not delay or prevent installation of the offline shell.
const shellAssets = assets.filter(name => !name.endsWith('.mp4'));
function serviceWorker() {
  const template = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const hash = crypto.createHash('sha256').update(template);
  for (const name of assets) hash.update(name).update(fs.readFileSync(path.join(root, ...name.split('/'))));
  return template.replace('__MATCHUP_VERSION__', hash.digest('hex').slice(0, 20)).replace('__MATCHUP_ASSETS__', JSON.stringify(shellAssets));
}
module.exports = {root, assets, shellAssets, serviceWorker};
