'use strict';
// Default is offline. --apply is the ONLY committing path; never replays prerequisite migrations.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
function migrationSql() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'mentorship-groups.sql'), 'utf8');
  if (!/^BEGIN;$/m.test(sql) || !/COMMIT;\s*$/.test(sql)) throw new Error('Group migration must be transaction wrapped.');
  return sql.replace(/^BEGIN;\s*/m, '').replace(/COMMIT;\s*$/, '');
}
function validate() {
  const sql = migrationSql();
  for (const token of ['Product restrictions prerequisite missing', 'mentor_group_join_code', 'mentor_group_update', 'mentor_group_code', 'mentor_group_remove', 'FOR UPDATE', 'gen_random_uuid()', 'ENABLE ROW LEVEL SECURITY', 'REVOKE ALL', 'mentor_groups__eligible']) {
    if (!sql.includes(token)) throw new Error('Incomplete group migration.');
  }
  if (/\b(?:TRUNCATE|DROP\s+TABLE)\s+public\./i.test(sql) || /(?:UPDATE|DELETE\s+FROM)\s+auth\.users/i.test(sql)
    || /CREATE OR REPLACE FUNCTION public\.(?:mentor_actor|mentor__eligible)\(/.test(sql)) throw new Error('Destructive or prerequisite auth mutation prohibited.');
  return sql;
}
const quote = s => '"' + s.replaceAll('"', '""') + '"';
async function snapshot(db, relations) {
  if (!relations) relations = (await db.query(`SELECT c.table_schema schema,c.table_name name,array_agg(c.column_name::text ORDER BY c.ordinal_position) columns
    FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name)
    WHERE t.table_type='BASE TABLE' AND (c.table_schema='public' OR (c.table_schema='auth' AND c.table_name='users') OR (c.table_schema='storage' AND c.table_name IN('objects','buckets')))
    GROUP BY c.table_schema,c.table_name ORDER BY 1,2`)).rows;
  const hashes = {};
  for (const r of relations) {
    const table = `${quote(r.schema)}.${quote(r.name)}`;
    hashes[table] = (await db.query(`SELECT count(*)::integer n,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) hash FROM (SELECT ${r.columns.map(quote).join(',')} FROM ${table}) t`)).rows[0];
  }
  return { relations, hashes };
}
async function authSnapshot(db) {
  return (await db.query(`SELECT oid::regprocedure::text signature,md5(prosrc) hash,proacl::text,proconfig FROM pg_proc
    WHERE oid IN('public.mentor_actor()'::regprocedure,'public.mentor__eligible(uuid)'::regprocedure,'public.mentor_ac__actor()'::regprocedure)
    ORDER BY 1`)).rows;
}
async function applyGroups(db) {
  const sql = validate(); await db.query('BEGIN');
  try {
    const before = await snapshot(db), auth = await authSnapshot(db);
    await db.query(sql);
    assert.deepEqual((await snapshot(db, before.relations)).hashes, before.hashes, 'Every original column and row must be preserved');
    assert.deepEqual(await authSnapshot(db), auth, 'Existing authentication and restrictions must be unchanged');
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
async function main(args = process.argv.slice(2)) {
  if (args.some(a => !['--apply', '--help'].includes(a)) || new Set(args).size !== args.length) throw new Error('Usage: node tools\\deploy-groups.cjs [--apply]');
  if (args.includes('--help')) { console.log('Usage: node tools\\deploy-groups.cjs [--apply]\nDefault: offline validation. --apply: additive migration with original-column/row and auth preservation checks.'); return; }
  validate();
  if (!args.includes('--apply')) { console.log('PASS group offline structural validation. No database connection.'); return; }
  const { client } = require('../tests/backend-db'); const db = client();
  try { await db.connect(); await applyGroups(db); }
  finally { await db.end(); }
  console.log('Group migration committed atomically; all original columns/rows and auth helpers preserved.');
}
if (require.main === module) main().catch(() => { console.error('Group operation failed and was not committed. Check prerequisites/access; database details suppressed.'); process.exitCode = 1; });
module.exports = { migrationSql, validate, snapshot, authSnapshot, applyGroups, main };
