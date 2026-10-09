'use strict';

// node tests/backend-reset.js
// Applies no migration automatically. Exercises SQL roles, the real HTTP RPC, and
// concurrent committed transactions using only newly generated fixture accounts.
// Passwords/tokens remain in memory; cleanup removes every owned account and row.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { client } = require('./backend-db');

const tag = 'spark-pilot-reset-test';
const keys = ['mode', 'outgoing_swipes', 'reciprocal_swipes', 'matches', 'messages', 'notifications'];
const zeros = mode => ({ mode, outgoing_swipes: 0, reciprocal_swipes: 0, matches: 0, messages: 0, notifications: 0 });

async function as(db, id, action, role = 'authenticated') {
  await db.query('BEGIN');
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)",
      [id || '', JSON.stringify(id ? { sub: id, role } : { role })]);
    const result = await action(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const db = client();
  const first = client();
  const second = client();
  const ids = Array.from({ length: 10 }, () => randomUUID());
  const [alice, bob, carol, dave, erin, frank, gina, hank, raceA, raceB] = ids;
  const password = `${randomBytes(24).toString('base64url')}Aa1!`;
  let passed = 0;
  let stage = 'connecting';
  let token;
  const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const url = source.match(/\bSUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const key = source.match(/\bSUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
  assert.ok(url && key, 'Public Supabase configuration unavailable');
  const pass = label => { passed++; console.log(`PASS ${label}`); };
  const rpc = (id, mode = 'all') => as(first, id, async tx =>
    (await tx.query('SELECT public.reset_my_test_activity($1) AS result', [mode])).rows[0].result);
  const swipe = (from, to, direction = 'like') => as(first, from, tx => tx.query(
    'INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, $3)', [from, to, direction]));
  const findMatch = async (a, b) => (await db.query(`SELECT * FROM public.matches
    WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`, [a, b])).rows;
  const chat = (sender, match, content = 'Disposable reset fixture message') => as(first, sender,
    tx => tx.query('INSERT INTO public.messages (match_id, sender_id, content) VALUES ($1, $2, $3)', [match, sender, content]));
  const match = async (a, b, direction = 'like') => {
    await swipe(a, b, direction);
    await swipe(b, a);
    const rows = await findMatch(a, b);
    assert.equal(rows.length, 1);
    return rows[0].id;
  };
  const http = async (body, accessToken = token) => {
    const response = await fetch(`${url}/rest/v1/rpc/reset_my_test_activity`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    return { status: response.status, body: await response.json() };
  };
  const denied = async (id, sql, values, code = '42501', role = 'authenticated') => {
    await assert.rejects(as(first, id, tx => tx.query(sql, values), role), error => error.code === code);
  };
  const snapshot = async () => {
    const result = {};
    for (const table of ['profiles', 'user_filters', 'user_interests', 'user_photos', 'blocks', 'reports']) {
      const column = table === 'profiles' ? 'id' : table === 'blocks' ? 'blocker_id' : table === 'reports' ? 'reporter_id' : 'user_id';
      result[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM public.${table} t
        WHERE ${column} = ANY($1::uuid[]) ORDER BY to_jsonb(t)::text`, [ids])).rows;
    }
    return result;
  };
  try {
    await Promise.all([db.connect(), first.connect(), second.connect()]);
    stage = 'creating disposable fixtures';
    await db.query('BEGIN');
    for (const id of ids) {
      const email = `backend-reset-${id}@example.invalid`;
      await db.query(`INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
          extensions.crypt($3, extensions.gen_salt('bf', 10)), now(), '', '', '', '',
          '{"provider":"email","providers":["email"]}', $4::jsonb, now(), now())`,
      [id, email, password, JSON.stringify({ name: 'Disposable reset fixture', birth_date: '1995-06-15', backend_fixture: tag })]);
      await db.query(`INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
        VALUES ($1::text, $1::uuid, $2::jsonb, 'email', now(), now())`,
      [id, JSON.stringify({ sub: id, email, email_verified: true, phone_verified: false })]);
    }
    await db.query('COMMIT');
    const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `backend-reset-${alice}@example.invalid`, password }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(login.status, 200, 'Disposable user password login failed');
    token = (await login.json()).access_token;
    assert.ok(token);

    stage = 'authorization and empty reset';
    const initial = await http({});
    assert.equal(initial.status, 200);
    assert.deepEqual(initial.body, zeros('all'));
    assert.deepEqual(Object.keys(initial.body).sort(), [...keys].sort());
    await denied(null, 'SELECT public.reset_my_test_activity()', [], '42501', 'anon');
    await denied(null, 'SELECT public.reset_my_test_activity()', []);
    await denied(alice, "SELECT public.reset_my_test_activity('other')", [], '22023');
    await denied(alice, 'SELECT public.reset_my_test_activity(NULL)', [], '22023');
    await denied(alice, 'SELECT public.reset_my_test_activity($1, $2)', ['all', bob], '42883');
    await denied(alice, 'SELECT public.reset_my_test_activity(user_id => $1)', [bob], '42883');
    assert.equal((await http({}, null)).status, 401);
    assert.equal((await http({ reset_mode: 'invalid' })).status, 400);
    assert.equal((await http({ reset_mode: 'all', user_id: bob })).status, 404);
    const acl = (await db.query(`SELECT p.prosecdef, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
      FROM pg_proc p WHERE p.oid = 'public.reset_my_test_activity(text)'::regprocedure`)).rows[0];
    assert.equal(acl.prosecdef, true);
    assert.ok(acl.proconfig.includes('search_path=""'));
    assert.equal(acl.anon, false);
    assert.equal(acl.service_role, false);
    assert.equal(acl.authenticated, true);
    pass(stage);

    stage = 'seeding active, inactive, blocked and unrelated relationships';
    const ab = await match(alice, bob, 'super');
    const ac = await match(alice, carol);
    const ad = await match(alice, dave);
    const ef = await match(erin, frank);
    await chat(alice, ab);
    await chat(bob, ab);
    await chat(carol, ac);
    await chat(dave, ad);
    await chat(erin, ef);
    await as(first, carol, tx => tx.query('UPDATE public.matches SET active = false WHERE id = $1', [ac]));
    await as(first, dave, tx => tx.query('INSERT INTO public.blocks (blocker_id, blocked_id) VALUES ($1, $2)', [dave, alice]));
    assert.equal((await findMatch(alice, dave))[0].active, false);
    // Include a historical reversed pair; reset must not assume canonical order.
    await db.query('UPDATE public.matches SET user1_id = GREATEST(user1_id, user2_id), user2_id = LEAST(user1_id, user2_id) WHERE id = $1', [ac]);
    await swipe(alice, erin, 'nope');
    await swipe(erin, alice, 'nope');
    await swipe(alice, frank);
    await swipe(frank, alice, 'nope');
    await swipe(gina, alice, 'super');
    await swipe(alice, hank, 'super');
    await swipe(hank, alice, 'nope');
    await swipe(bob, erin);
    await as(first, alice, async tx => {
      await tx.query("UPDATE public.profiles SET bio = 'Keep profile', photos = ARRAY['https://example.invalid/fixture.jpg'], interests = ARRAY['Music'] WHERE id = $1", [alice]);
      await tx.query('UPDATE public.user_filters SET max_distance = 77 WHERE user_id = $1', [alice]);
      await tx.query("INSERT INTO public.user_interests (user_id, interest) VALUES ($1, 'Music')", [alice]);
      await tx.query("INSERT INTO public.user_photos (user_id, url) VALUES ($1, 'https://example.invalid/fixture.jpg')", [alice]);
      await tx.query("INSERT INTO public.reports (reporter_id, reported_id, reason) VALUES ($1, $2, 'Fixture report')", [alice, dave]);
    });
    await db.query(`INSERT INTO public.notifications (user_id, related_user_id, type, title)
      VALUES ($1, $2, 'system', 'Keep system notification'), ($2, $1, 'system', 'Keep peer system notification')`, [alice, bob]);
    const preserved = await snapshot();
    const authBefore = (await db.query('SELECT id, email, encrypted_password FROM auth.users WHERE id = ANY($1::uuid[]) ORDER BY id', [ids])).rows;
    const before = {};
    for (const table of ['swipes', 'matches', 'messages', 'notifications']) {
      const column = table === 'swipes' ? 'swiper_id' : table === 'matches' ? 'user1_id' : table === 'messages' ? 'sender_id' : 'user_id';
      before[table] = (await db.query(`SELECT * FROM public.${table} WHERE ${column} = ANY($1::uuid[]) ORDER BY id`, [ids])).rows;
    }
    pass(stage);

    stage = 'nope-only removes only outgoing nopes; repeat returns zero';
    const nope = await http({ reset_mode: 'nope' });
    assert.equal(nope.status, 200);
    assert.deepEqual(nope.body, { ...zeros('nope'), outgoing_swipes: 1 });
    assert.deepEqual(await rpc(alice, 'nope'), zeros('nope'));
    for (const table of ['swipes', 'matches', 'messages', 'notifications']) {
      const column = table === 'swipes' ? 'swiper_id' : table === 'matches' ? 'user1_id' : table === 'messages' ? 'sender_id' : 'user_id';
      const actual = (await db.query(`SELECT * FROM public.${table} WHERE ${column} = ANY($1::uuid[]) ORDER BY id`, [ids])).rows;
      const expected = before[table].filter(row => table !== 'swipes' || row.swiper_id !== alice || row.direction !== 'nope');
      assert.deepEqual(actual, expected);
    }
    pass(stage);

    stage = 'all resets matched pairs/chat/notices and preserves unrelated and incoming activity';
    const reset = await http({});
    assert.equal(reset.status, 200);
    assert.deepEqual(reset.body, { mode: 'all', outgoing_swipes: 5, reciprocal_swipes: 3, matches: 3, messages: 4, notifications: 15 });
    const peers = [bob, carol, dave];
    for (const table of ['swipes', 'matches', 'messages', 'notifications']) {
      const column = table === 'swipes' ? 'swiper_id' : table === 'matches' ? 'user1_id' : table === 'messages' ? 'sender_id' : 'user_id';
      const actual = (await db.query(`SELECT * FROM public.${table} WHERE ${column} = ANY($1::uuid[]) ORDER BY id`, [ids])).rows;
      const expected = before[table].filter(row => {
        if (table === 'swipes') return row.swiper_id !== alice && !(row.swiped_id === alice && peers.includes(row.swiper_id));
        if (table === 'matches') return row.user1_id !== alice && row.user2_id !== alice;
        if (table === 'messages') return ![ab, ac, ad].includes(row.match_id);
        if (row.type === 'system') return true;
        return !((row.user_id === alice && peers.includes(row.related_user_id)) ||
          (row.related_user_id === alice && [...peers, frank, hank].includes(row.user_id)));
      });
      assert.deepEqual(actual, expected, `${table} preservation`);
    }
    assert.deepEqual(await snapshot(), preserved);
    assert.deepEqual((await db.query('SELECT id, email, encrypted_password FROM auth.users WHERE id = ANY($1::uuid[]) ORDER BY id', [ids])).rows, authBefore);
    assert.deepEqual(await rpc(alice), zeros('all'));
    assert.deepEqual(await rpc(alice, 'nope'), zeros('nope'));
    pass(stage);

    stage = 'fresh UUID/chat after mutual rematch; stale chat rejected; blocks remain effective';
    await denied(alice, "INSERT INTO public.messages (match_id, sender_id, content) VALUES ($1, $2, 'stale')", [ab, alice]);
    await swipe(alice, bob);
    assert.equal((await findMatch(alice, bob)).length, 0);
    await swipe(bob, alice, 'super');
    const fresh = (await findMatch(alice, bob))[0];
    assert.notEqual(fresh.id, ab);
    assert.equal(fresh.active, true);
    assert.equal(fresh.is_super, true);
    assert.equal((await db.query('SELECT id FROM public.messages WHERE match_id = $1', [fresh.id])).rowCount, 0);
    await chat(alice, fresh.id, 'Fresh chat only');
    assert.equal((await db.query('SELECT content FROM public.messages WHERE match_id = $1', [fresh.id])).rows[0].content, 'Fresh chat only');
    const renewedInactive = await match(alice, carol);
    assert.notEqual(renewedInactive, ac);
    for (const [self, peer] of [[alice, dave], [dave, alice]]) {
      await denied(self, "INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'like')", [self, peer]);
    }
    assert.equal((await findMatch(alice, dave)).length, 0);
    assert.deepEqual(await snapshot(), preserved);
    pass(stage);

    stage = 'concurrent in-flight swipe is drained before reset snapshots its new match';
    await swipe(raceA, raceB);
    await second.query('BEGIN');
    await second.query('SET LOCAL ROLE authenticated');
    await second.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [raceB]);
    await second.query("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'like')", [raceB, raceA]);
    let done = false;
    const waiting = rpc(raceA).then(result => { done = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(done, false);
    await second.query('COMMIT');
    const concurrent = await waiting;
    assert.deepEqual(concurrent, { mode: 'all', outgoing_swipes: 1, reciprocal_swipes: 1, matches: 1, messages: 0, notifications: 3 });
    assert.equal((await findMatch(raceA, raceB)).length, 0);
    pass(stage);

    stage = 'reset blocks a new swipe until commit; subsequent mutual swipes rematch cleanly';
    await as(first, raceA, async tx => {
      assert.deepEqual((await tx.query('SELECT public.reset_my_test_activity() AS result')).rows[0].result, zeros('all'));
      let completed = false;
      const pending = as(second, raceB, other => other.query(
        "INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'super')", [raceB, raceA]))
        .then(() => { completed = true; });
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(completed, false);
      await tx.query('COMMIT');
      await pending;
    });
    await swipe(raceA, raceB);
    assert.equal((await findMatch(raceA, raceB)).length, 1);
    pass(stage);

    stage = 'concurrent existing message write is drained and counted by reset';
    const racingMatch = (await findMatch(raceA, raceB))[0].id;
    await second.query('BEGIN');
    await second.query('SET LOCAL ROLE authenticated');
    await second.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [raceB]);
    await second.query("INSERT INTO public.messages (match_id, sender_id, content) VALUES ($1, $2, 'Concurrent fixture message')", [racingMatch, raceB]);
    let finished = false;
    const waitingForChat = rpc(raceA).then(result => { finished = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(finished, false);
    await second.query('COMMIT');
    const chatReset = await waitingForChat;
    assert.equal(chatReset.messages, 1);
    assert.equal(chatReset.matches, 1);
    assert.equal(chatReset.notifications, 4);
    assert.deepEqual(await rpc(raceA), zeros('all'));
    pass(stage);

    stage = 'a stale chat racing after reset cannot recreate deleted history';
    const staleMatch = await match(raceA, raceB);
    await as(first, raceA, async tx => {
      await tx.query('SELECT public.reset_my_test_activity()');
      let completed = false;
      const pending = as(second, raceB, other => other.query(
        "INSERT INTO public.messages (match_id, sender_id, content) VALUES ($1, $2, 'Must not survive')", [staleMatch, raceB]))
        .then(() => { completed = true; return null; }, error => { completed = true; return error; });
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(completed, false);
      await tx.query('COMMIT');
      const error = await pending;
      assert.ok(error && ['23503', '42501'].includes(error.code));
    });
    assert.equal((await db.query('SELECT id FROM public.messages WHERE match_id = $1', [staleMatch])).rowCount, 0);
    assert.equal((await findMatch(raceA, raceB)).length, 0);
    pass(stage);

    stage = 'two simultaneous participant resets serialize and the second is a no-op';
    await match(raceA, raceB);
    await as(first, raceA, async tx => {
      const firstReset = (await tx.query('SELECT public.reset_my_test_activity() AS result')).rows[0].result;
      assert.equal(firstReset.matches, 1);
      let completed = false;
      const pending = as(second, raceB, async other =>
        (await other.query('SELECT public.reset_my_test_activity() AS result')).rows[0].result)
        .then(result => { completed = true; return result; });
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(completed, false);
      await tx.query('COMMIT');
      assert.deepEqual(await pending, zeros('all'));
    });
    pass(stage);

    stage = 'lock contention fails atomically after the bounded wait; retry succeeds';
    const timeoutMatch = await match(raceA, raceB);
    await second.query('BEGIN');
    await second.query('SET LOCAL ROLE authenticated');
    await second.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [raceB]);
    await second.query("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'nope')", [raceB, hank]);
    await assert.rejects(rpc(raceA), error => error.code === '55P03');
    assert.equal((await findMatch(raceA, raceB))[0].id, timeoutMatch);
    assert.equal((await db.query('SELECT id FROM public.swipes WHERE swiper_id = $1 OR (swiper_id = $2 AND swiped_id = $1)', [raceA, raceB])).rowCount, 2);
    await second.query('COMMIT');
    const retry = await rpc(raceA);
    assert.equal(retry.matches, 1);
    assert.equal(retry.outgoing_swipes, 1);
    assert.equal(retry.reciprocal_swipes, 1);
    assert.equal((await db.query('SELECT id FROM public.swipes WHERE swiper_id = $1 AND swiped_id = $2', [raceB, hank])).rowCount, 1);
    pass(stage);
  } catch (error) {
    console.error(`FAIL ${stage} (${error.code || error.name})`);
    if (error.code === 'ERR_ASSERTION') console.error(error.message);
    process.exitCode = 1;
  } finally {
    await Promise.all([first, second].map(async connection => {
      try { await connection.query('ROLLBACK'); } catch (_) { /* May not have connected. */ }
      await connection.end();
    }));
    try {
      await db.query('ROLLBACK');
      const removed = await db.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])
        AND raw_user_meta_data->>'backend_fixture' = $2
        AND email = 'backend-reset-' || id::text || '@example.invalid'`, [ids, tag]);
      assert.equal((await db.query('SELECT id FROM auth.users WHERE id = ANY($1::uuid[])', [ids])).rowCount, 0);
      for (const table of ['identities', 'sessions', 'refresh_tokens']) {
        assert.equal((await db.query(`SELECT 1 FROM auth.${table} WHERE user_id::text = ANY($1::text[])`, [ids])).rowCount, 0, `${table} cleanup`);
      }
      for (const [table, columns] of Object.entries({
        profiles: ['id'], user_filters: ['user_id'], user_interests: ['user_id'], user_photos: ['user_id'],
        swipes: ['swiper_id', 'swiped_id'], matches: ['user1_id', 'user2_id'], messages: ['sender_id'],
        notifications: ['user_id', 'related_user_id'], blocks: ['blocker_id', 'blocked_id'], reports: ['reporter_id', 'reported_id'],
      })) {
        assert.equal((await db.query(`SELECT 1 FROM public.${table} WHERE ${columns.map(column => `${column} = ANY($1::uuid[])`).join(' OR ')}`, [ids])).rowCount, 0, `${table} cleanup`);
      }
      console.log(`CLEANUP removed ${removed.rowCount} owned fixture accounts; verified zero owned application rows; no storage objects created`);
    } finally { await db.end(); }
  }
  console.log(`${passed} reset integration groups passed`);
}

main().catch(error => { console.error(`Reset test could not finish (${error.code || error.name})`); process.exitCode = 1; });
