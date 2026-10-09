'use strict';

// node tests/backend-concurrency.js
// Commits only fresh fixture UUIDs to exercise real concurrent transactions.
// Cleanup deletes only these auth IDs and their cascading fixture rows, even on failure.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { client } = require('./backend-db');

async function main() {
  const admin = client();
  const ids = Array.from({ length: 6 }, () => randomUUID());
  const connections = [];
  let fixturesCommitted = false;
  try {
    await admin.connect();
    await admin.query('BEGIN');
    for (const id of ids) {
      await admin.query(`INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
        VALUES ($1, 'authenticated', 'authenticated', $2, '{"name":"Backend concurrent fixture","birth_date":"1995-06-15"}', now(), now())`,
        [id, `backend-concurrency-${id}@example.invalid`]);
    }
    await admin.query('COMMIT');
    fixturesCommitted = true;
    for (let i = 0; i < ids.length; i += 2) {
      const [alice, bob] = ids.slice(i, i + 2);
      const a = client();
      const b = client();
      connections.push(a, b);
      await Promise.all([a.connect(), b.connect()]);
      for (const [db, id] of [[a, alice], [b, bob]]) {
        await db.query('BEGIN');
        await db.query('SET LOCAL ROLE authenticated');
        await db.query("SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)",
          [id, JSON.stringify({ sub: id, role: 'authenticated' })]);
      }
      // Keep the first swipe transaction open while the reciprocal insert waits on its pair lock.
      await a.query("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'like')", [alice, bob]);
      const reciprocal = b.query("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'super')", [bob, alice]);
      await a.query('COMMIT');
      await reciprocal;
      const rows = (await b.query(`SELECT id, is_super FROM public.matches
        WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`, [alice, bob])).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].is_super, true);
      await b.query('COMMIT');
      console.log(`PASS concurrent reciprocal pair ${i / 2 + 1}: exactly one super match`);
    }
  } finally {
    await Promise.all(connections.map(async db => {
      try { await db.query('ROLLBACK'); } catch (_) { /* A failed connection may already be closed. */ }
      await db.end();
    }));
    try {
      if (fixturesCommitted) {
        const removed = await admin.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [ids]);
        assert.equal(removed.rowCount, ids.length);
        console.log(`CLEANUP deleted only ${ids.length} generated fixture users and their dependent test rows`);
      } else {
        await admin.query('ROLLBACK');
      }
    } finally { await admin.end(); }
  }
}

main().catch(error => { console.error(`Concurrency check failed (${error.code || error.name})`); process.exitCode = 1; });
