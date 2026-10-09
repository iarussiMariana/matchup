'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { migrationSql, validate, applyProduct } = require('../tools/deploy-product.cjs');
const { parse, execute } = require('../tools/moderation-admin.cjs');
const user = 'fe12bb61-20ad-48ce-9744-00cd3a399818';
test('offline migration validation preserves transaction ownership and guards', () => {
  const sql = validate();
  assert.equal(sql, migrationSql());
  assert.doesNotMatch(sql, /^BEGIN;|COMMIT;\s*$/m);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /Unknown helper version/);
  assert.match(sql, /Unknown material permission view/);
  assert.doesNotMatch(sql, /UPDATE\s+auth\.users|DROP\s+TABLE/i);
});
test('apply transaction commits only on success and rolls back errors', async () => {
  for (const fail of [false, true]) {
    const calls = [];
    const db = { query: async sql => { calls.push(sql); if (fail && calls.length === 2) throw new Error('fixture'); } };
    if (fail) await assert.rejects(() => applyProduct(db)); else await applyProduct(db);
    assert.equal(calls[0], 'BEGIN'); assert.equal(calls.at(-1), fail ? 'ROLLBACK' : 'COMMIT');
    assert.equal(calls.length, 3);
  }
});
test('apply hooks capture and validate on the same transaction before commit', async () => {
  const calls = []; const baseline = { hash: 'fixture' };
  const db = { query: async sql => { calls.push(sql); } };
  await applyProduct(db, {
    beforeApply: async connection => { assert.equal(connection, db); assert.deepEqual(calls, ['BEGIN']); calls.push('snapshot'); return baseline; },
    afterApply: async (connection, original) => { assert.equal(connection, db); assert.equal(original, baseline); assert.equal(calls.length, 3); calls.push('verify'); }
  });
  assert.deepEqual([calls[0], calls[1], calls[3], calls[4]], ['BEGIN', 'snapshot', 'verify', 'COMMIT']);
});
test('hook errors and false validation roll back without commit', async () => {
  for (const failure of ['before', 'after', 'false']) {
    const calls = []; const db = { query: async sql => { calls.push(sql); } };
    await assert.rejects(() => applyProduct(db, {
      beforeApply: async () => { if (failure === 'before') throw new Error('baseline failed'); return 'baseline'; },
      afterApply: async () => { if (failure === 'false') return false; throw new Error('changed rows'); }
    }));
    assert.equal(calls.at(-1), 'ROLLBACK'); assert.ok(!calls.includes('COMMIT'));
    assert.equal(calls.length, failure === 'before' ? 2 : 3);
  }
});
test('invalid hooks fail before opening a transaction', async () => {
  const db = { query: async () => { assert.fail('must not connect'); } };
  await assert.rejects(() => applyProduct(db, { beforeApply: true }), TypeError);
  await assert.rejects(() => applyProduct(db, { afterApply: true }), TypeError);
});
test('admin requires explicit target and has no implicit granting', () => {
  assert.deepEqual(parse([]), { action: 'help' }); assert.deepEqual(parse(['--help']), { action: 'help' });
  for (const action of ['check', 'grant', 'revoke']) assert.deepEqual(parse([`--${action}`, user]), { action, user });
  for (const args of [['--grant'], ['--revoke'], ['--grant', 'all'], ['--grant', user, '--revoke'], [user], ['--list']]) assert.throws(() => parse(args));
});
test('admin check is read only; failed grant rolls back', async () => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push([sql, params]); return { rows: [{ enabled: false, eligible: false }] }; } };
  assert.equal(await execute(db, { action: 'check', user }), false); assert.equal(calls.length, 1); assert.match(calls[0][0], /^SELECT /);
  await assert.rejects(() => execute(db, { action: 'grant', user }));
  assert.equal(calls.at(-1)[0], 'ROLLBACK'); assert.ok(!calls.some(c => /^INSERT/.test(c[0])));
});
test('default deployment/admin commands never connect', () => {
  for (const name of ['deploy-product.cjs', 'moderation-admin.cjs']) {
    const out = spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', name)], { encoding: 'utf8', env: { ...process.env, SUPABASE_DB_URL: 'postgres://invalid:invalid@127.0.0.1:1/invalid' } });
    assert.equal(out.status, 0, out.stderr); assert.match(out.stdout, /offline|never connects/i);
  }
});
