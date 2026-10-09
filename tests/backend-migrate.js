'use strict';

// Explicit opt-in: node tests/backend-migrate.js --apply-mvp-fixes
// Never applies the legacy seed/migration or changes auth configuration.
const fs = require('node:fs');
const path = require('node:path');
const { client } = require('./backend-db');

async function main() {
  if (!process.argv.includes('--apply-mvp-fixes')) {
    throw new Error('Use --apply-mvp-fixes to apply the idempotent MVP correction');
  }
  const db = client();
  try {
    await db.connect();
    await db.query(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'mvp-fixes.sql'), 'utf8'));
    console.log('MVP corrections committed; no user data deleted or auth settings changed.');
  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error(`Migration failed (${error.code || error.name}); no credentials logged.`);
  process.exitCode = 1;
});
