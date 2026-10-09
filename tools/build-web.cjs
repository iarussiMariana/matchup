const fs = require('node:fs');
const path = require('node:path');
const {root, assets, serviceWorker} = require('./web-assets.cjs');
fs.mkdirSync(path.join(root, 'vendor'), {recursive:true});
fs.copyFileSync(path.join(root, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'), path.join(root, 'vendor', 'supabase.js'));
// Remove only generated web output so retired modes cannot remain in the APK.
fs.rmSync(path.join(root, 'www'), {recursive:true, force:true});
for (const name of assets) {
  const parts = name.split('/');
  const destination = path.join(root, 'www', ...parts);
  fs.mkdirSync(path.dirname(destination), {recursive:true});
  fs.copyFileSync(path.join(root, ...parts), destination);
}
fs.writeFileSync(path.join(root, 'www', 'sw.js'), serviceWorker());
console.log('MatchUp web assets, brand icons, manifest and versioned offline shell bundled locally.');
