'use strict';
// Offline by default. --apply is the only code path that connects and commits.
const fs = require('node:fs');
const path = require('node:path');
function migrationSql() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'mentorship-product.sql'), 'utf8');
  if (!/^BEGIN;$/m.test(sql) || !/COMMIT;\s*$/.test(sql)) throw new Error('Product migration must be transaction wrapped.');
  return sql.replace(/^BEGIN;\s*/m, '').replace(/COMMIT;\s*$/, '');
}
function validate() {
  const sql = migrationSql();
  for (const token of ['mentor_save_product', 'mentor_discover_product', 'mentor_favorites', 'mentor_request_product', 'mentor_report', 'mentor_moderate', 'REVOKE ALL', 'ENABLE ROW LEVEL SECURITY', 'Unknown helper version']) {
    if (!sql.includes(token)) throw new Error('Product migration is incomplete.');
  }
  if (/\b(?:TRUNCATE|DROP\s+TABLE)\s+public\./i.test(sql) || /UPDATE\s+auth\.users/i.test(sql)) throw new Error('Destructive account operation prohibited.');
  return sql;
}
// Owns BEGIN/COMMIT/ROLLBACK; db must be connected and outside a transaction.
// Hooks run on this same client/transaction and must not manage its lifecycle.
// beforeApply returns a baseline; afterApply(db, baseline) must throw or return false on mismatch.
async function applyProduct(db, { beforeApply, afterApply } = {}) {
  for (const hook of [beforeApply, afterApply]) {
    if (hook !== undefined && typeof hook !== 'function') throw new TypeError('Migration hooks must be functions.');
  }
  const sql = validate();
  await db.query('BEGIN');
  try {
    const baseline = beforeApply ? await beforeApply(db) : undefined;
    await db.query(sql);
    if (afterApply && await afterApply(db, baseline) === false) throw new Error('Migration preservation validation failed.');
    await db.query('COMMIT');
  }
  catch (error) { await db.query('ROLLBACK'); throw error; }
}
async function main(args = process.argv.slice(2)) {
  if (args.some(a => !['--apply', '--help'].includes(a)) || new Set(args).size !== args.length) throw new Error('Usage: node tools\\deploy-product.cjs [--apply]');
  if (args.includes('--help')) { console.log('Usage: node tools\\deploy-product.cjs [--apply]\nDefault: offline structural validation; --apply: atomic additive migration, no fixtures.'); return; }
  validate();
  if (!args.includes('--apply')) { console.log('PASS product offline structural validation. No database connection; SQL execution requires --apply.'); return; }
  const { client } = require('../tests/backend-db');
  let db;
  try { db = client(); await db.connect(); await applyProduct(db); }
  catch { throw new Error('Product deployment failed; no partial migration committed. Database details suppressed.'); }
  finally { if (db) await db.end(); }
  console.log('Product migration committed atomically; existing data preserved.');
}
if (require.main === module) main().catch(() => { console.error('Product operation failed. Check arguments, prerequisites and database access; details suppressed.'); process.exitCode = 1; });
module.exports = { migrationSql, validate, applyProduct, main };
