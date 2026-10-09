'use strict';
// Offline by default; --apply only installs the function, never invokes a user reset.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { snapshot, authSnapshot } = require('./deploy-groups.cjs');
function validate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'mentorship-lab.sql'), 'utf8');
  assert.match(sql, /^BEGIN;$/m); assert.match(sql, /COMMIT;\s*$/);
  for (const token of ['Product restrictions prerequisite missing', 'mentor_reset_connections(p_confirmation text)', "p_confirmation IS DISTINCT FROM 'RESETAR'", 'public.mentor_ac__actor()', 'public.mentor__lock(u)', 'learner_id=u OR mentor_id=u', 'REVOKE ALL', 'SET search_path = \'\'']) assert.ok(sql.includes(token), `Missing reset invariant: ${token}`);
  assert.doesNotMatch(sql, /(?:TRUNCATE|DROP\s+TABLE|DELETE\s+FROM\s+(?:auth\.|storage\.|public\.(?:profiles|mentor_profiles|mentor_blocks|mentor_reports|mentor_study_groups)))/i);
  return sql.replace(/^BEGIN;\s*/m, '').replace(/COMMIT;\s*$/, '');
}
async function apply(db) {
  const sql = validate(); await db.query('BEGIN');
  try {
    const before = await snapshot(db), auth = await authSnapshot(db);
    const functions = (await db.query("SELECT oid,md5(prosrc) hash,proacl::text,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname<>'mentor_reset_connections'")).rows;
    await db.query(sql);
    assert.deepEqual((await snapshot(db, before.relations)).hashes, before.hashes, 'All existing rows must be preserved');
    assert.deepEqual(await authSnapshot(db), auth, 'Authentication helpers must be preserved');
    for (const f of functions) assert.deepEqual((await db.query('SELECT oid,md5(prosrc) hash,proacl::text,proconfig FROM pg_proc WHERE oid=$1', [f.oid])).rows[0], f, 'Existing functions must be preserved');
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
async function main(args = process.argv.slice(2)) {
  if (args.some(a => !['--apply', '--help'].includes(a)) || new Set(args).size !== args.length) throw new Error('Invalid arguments');
  if (args.includes('--help')) { console.log('node tools\\deploy-lab.cjs [--apply]\nDefault: offline validation. --apply: install reset RPC while preserving all existing data; no user reset.'); return; }
  validate();
  if (!args.includes('--apply')) { console.log('PASS laboratory reset structural checks; no database connection.'); return; }
  const db = require('../tests/backend-db').client();
  try { await db.connect(); await apply(db); } finally { await db.end(); }
  console.log('Laboratory reset RPC installed; existing data and functions preserved. No account was reset.');
}
if (require.main === module) main().catch(() => { console.error('Laboratory migration failed; no commit. Database details suppressed.'); process.exitCode = 1; });
module.exports = { validate, apply, main };
