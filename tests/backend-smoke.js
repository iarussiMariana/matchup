'use strict';

// node tests/backend-smoke.js
// Uses rollback-only auth fixtures. All application queries run as authenticated or anon.
// Does not exercise email delivery, OAuth, Storage HTTP uploads, or payment processing.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { client } = require('./backend-db');

async function main() {
  const db = client();
  const [alice, bob, outsider, malformed] = Array.from({ length: 4 }, () => randomUUID());
  let currentTest = 'connect';
  let passed = 0;
  const check = (label) => { currentTest = label; };
  const pass = () => { passed++; console.log(`PASS ${currentTest}`); };
  const query = (sql, values) => db.query(sql, values);
  async function as(id, role = 'authenticated') {
    await query(`SET LOCAL ROLE ${role}`);
    await query("SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)",
      [id || '', JSON.stringify({ sub: id || '', role })]);
  }
  async function denied(sql, values) {
    await query('SAVEPOINT denied_operation');
    let error;
    try { await query(sql, values); } catch (e) { error = e; }
    await query('ROLLBACK TO SAVEPOINT denied_operation');
    await query('RELEASE SAVEPOINT denied_operation');
    assert.ok(error && error.code === '42501', 'Expected an authorization failure');
  }
  try {
    await db.connect();
    await query('BEGIN');
    check('auth fixtures create complete profiles and default filters');
    for (const id of [alice, bob, outsider, malformed]) {
      await query(`INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        VALUES ($1, 'authenticated', 'authenticated', $2, '{"provider":"email","providers":["email"]}', $3::jsonb, now(), now())`,
        [id, `backend-smoke-${id}@example.invalid`, JSON.stringify({ name: 'Backend Smoke Fixture', birth_date: id === malformed ? 'not-a-date' : '1995-06-15' })]);
    }
    await as(alice);
    assert.equal((await query('SELECT current_user AS role')).rows[0].role, 'authenticated');
    const profile = (await query('SELECT name, birth_date::text, age FROM public.profiles WHERE id = $1', [alice])).rows[0];
    assert.equal(profile.birth_date, '1995-06-15');
    assert.ok(profile.age >= 18);
    assert.equal((await query('SELECT * FROM public.user_filters WHERE user_id = $1', [alice])).rowCount, 1);
    assert.equal((await query('SELECT birth_date FROM public.profiles WHERE id = $1', [malformed])).rows[0].birth_date, null);
    pass();

    check('onboarding/profile updates persist only for owner; entitlements cannot be self-awarded');
    assert.equal((await query(`UPDATE public.profiles SET name = 'Smoke Alice', gender = 'Mulher',
      looking_for = 'Todos', age = 31, interests = ARRAY['Música'], photos = ARRAY[]::text[], onboarding_complete = true
      WHERE id = $1 RETURNING id`, [alice])).rowCount, 1);
    assert.equal((await query("UPDATE public.profiles SET name = 'forged' WHERE id = $1", [bob])).rowCount, 0);
    await denied('UPDATE public.profiles SET is_premium = true WHERE id = $1', [alice]);
    await denied('UPDATE public.profiles SET verified = true WHERE id = $1', [alice]);
    await denied('INSERT INTO public.user_interests (user_id, interest) VALUES ($1, $2)', [bob, 'forged']);
    await denied('INSERT INTO public.user_filters (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET min_age = 18', [bob]);
    pass();

    check('positive swipe is visible to recipient, not outsiders; no premature match');
    await query("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'super')", [alice, bob]);
    assert.equal((await query('SELECT id FROM public.matches WHERE user1_id = $1 OR user2_id = $1', [alice])).rowCount, 0);
    await as(bob);
    assert.equal((await query('SELECT id FROM public.swipes WHERE swiper_id = $1 AND swiped_id = $2', [alice, bob])).rowCount, 1);
    assert.equal((await query("SELECT id FROM public.notifications WHERE user_id = $1 AND related_user_id = $2 AND type = 'super_like'", [bob, alice])).rowCount, 1);
    await as(outsider);
    assert.equal((await query('SELECT id FROM public.swipes WHERE swiper_id = $1', [alice])).rowCount, 0);
    await denied("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'like')", [alice, outsider]);
    await as(alice);
    await denied("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $1, 'like')", [alice]);
    pass();

    check('reciprocal like creates exactly one canonical super match and two match notifications');
    await as(bob);
    await query("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'like')", [bob, alice]);
    const matches = (await query(`SELECT id, user1_id, user2_id, is_super FROM public.matches
      WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`, [alice, bob])).rows;
    assert.equal(matches.length, 1);
    const matchId = matches[0].id;
    assert.ok(matches[0].user1_id < matches[0].user2_id);
    assert.equal(matches[0].is_super, true);
    assert.equal((await query("SELECT id FROM public.notifications WHERE user_id = $1 AND type = 'match'", [bob])).rowCount, 1);
    await as(alice);
    assert.equal((await query("SELECT id FROM public.notifications WHERE user_id = $1 AND type = 'match'", [alice])).rowCount, 1);
    await denied('INSERT INTO public.matches (user1_id, user2_id) VALUES ($1, $2)', [alice, outsider]);
    await denied('UPDATE public.matches SET user2_id = $1 WHERE id = $2', [outsider, matchId]);
    pass();

    check('chat persists, notifies recipient, supports read receipts, rejects spoofing and outsiders');
    const messageId = (await query(`INSERT INTO public.messages (match_id, sender_id, content)
      VALUES ($1, $2, 'Backend smoke message') RETURNING id`, [matchId, alice])).rows[0].id;
    await denied("INSERT INTO public.messages (match_id, sender_id, content) VALUES ($1, $2, 'forged')", [matchId, bob]);
    await denied("INSERT INTO public.messages (match_id, sender_id, content) VALUES ($1, $2, '   ')", [matchId, alice]);
    assert.equal((await query('UPDATE public.messages SET read = true WHERE id = $1', [messageId])).rowCount, 0);
    await as(bob);
    assert.equal((await query('SELECT id FROM public.messages WHERE id = $1', [messageId])).rowCount, 1);
    assert.equal((await query('UPDATE public.messages SET read = true WHERE id = $1', [messageId])).rowCount, 1);
    await denied("UPDATE public.messages SET content = 'tampered' WHERE id = $1", [messageId]);
    assert.equal((await query("SELECT id FROM public.notifications WHERE user_id = $1 AND type = 'message' AND related_user_id = $2", [bob, alice])).rowCount, 1);
    assert.ok((await query('UPDATE public.notifications SET read = true WHERE user_id = $1', [bob])).rowCount > 0);
    await as(outsider);
    assert.equal((await query('SELECT id FROM public.messages WHERE match_id = $1', [matchId])).rowCount, 0);
    await denied("INSERT INTO public.messages (match_id, sender_id, content) VALUES ($1, $2, 'intrusion')", [matchId, outsider]);
    assert.equal((await query('SELECT id FROM public.matches WHERE id = $1', [matchId])).rowCount, 0);
    pass();

    check('rewind deletes only owned swipes; a repeated reciprocal like does not duplicate match');
    await as(alice);
    assert.equal((await query('DELETE FROM public.swipes WHERE swiper_id = $1 AND swiped_id = $2', [bob, alice])).rowCount, 0);
    assert.equal((await query('DELETE FROM public.swipes WHERE swiper_id = $1 AND swiped_id = $2', [alice, bob])).rowCount, 1);
    await query("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'super')", [alice, bob]);
    assert.equal((await query('SELECT id FROM public.matches WHERE id = $1', [matchId])).rowCount, 1);
    assert.equal((await query("SELECT id FROM public.notifications WHERE user_id = $1 AND type = 'match'", [alice])).rowCount, 1);
    pass();

    check('reports persist privately with server-owned moderation status');
    const reportId = (await query("INSERT INTO public.reports (reporter_id, reported_id, reason, details) VALUES ($1, $2, 'spam', 'smoke fixture') RETURNING id", [alice, bob])).rows[0].id;
    await denied("INSERT INTO public.reports (reporter_id, reported_id, reason) VALUES ($1, $2, 'forged')", [bob, outsider]);
    await denied("INSERT INTO public.reports (reporter_id, reported_id, reason, status) VALUES ($1, $2, 'spam', 'resolved')", [alice, bob]);
    await as(bob);
    assert.equal((await query('SELECT id FROM public.reports WHERE id = $1', [reportId])).rowCount, 0);
    pass();

    check('blocks persist and hide both directions; prevent further swipes and messages');
    await as(alice);
    await query('INSERT INTO public.blocks (blocker_id, blocked_id) VALUES ($1, $2)', [alice, bob]);
    assert.equal((await query('SELECT id FROM public.blocks WHERE blocker_id = $1 AND blocked_id = $2', [alice, bob])).rowCount, 1);
    for (const [self, peer] of [[alice, bob], [bob, alice]]) {
      await as(self);
      assert.equal((await query('SELECT id FROM public.profiles WHERE id = $1', [peer])).rowCount, 0);
      assert.equal((await query('SELECT id FROM public.matches WHERE id = $1', [matchId])).rowCount, 0);
      assert.equal((await query('SELECT id FROM public.messages WHERE match_id = $1', [matchId])).rowCount, 0);
      await denied("INSERT INTO public.messages (match_id, sender_id, content) VALUES ($1, $2, 'blocked')", [matchId, self]);
      await denied("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'like')", [self, peer]);
    }
    assert.equal((await query('DELETE FROM public.blocks WHERE blocker_id = $1', [alice])).rowCount, 0);
    await as(alice);
    await query('DELETE FROM public.blocks WHERE blocker_id = $1 AND blocked_id = $2', [alice, bob]);
    assert.equal((await query('SELECT active FROM public.matches WHERE id = $1', [matchId])).rows[0].active, false);
    await denied('UPDATE public.matches SET active = true WHERE id = $1', [matchId]);
    await denied("INSERT INTO public.messages (match_id, sender_id, content) VALUES ($1, $2, 'inactive')", [matchId, alice]);
    pass();

    check('negative swipes stay private, and only their owner can rewind them');
    await query("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'nope')", [alice, outsider]);
    await as(outsider);
    assert.equal((await query('SELECT id FROM public.swipes WHERE swiper_id = $1 AND swiped_id = $2', [alice, outsider])).rowCount, 0);
    pass();

    check('unmatch persists for both participants and rejects further chat without deleting history');
    await as(bob);
    await query("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'like')", [bob, outsider]);
    await as(outsider);
    await query("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'like')", [outsider, bob]);
    const unmatchId = (await query(`SELECT id FROM public.matches WHERE
      (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`, [bob, outsider])).rows[0].id;
    await as(alice);
    assert.equal((await query('UPDATE public.matches SET active = false WHERE id = $1', [unmatchId])).rowCount, 0);
    await as(bob);
    assert.equal((await query('UPDATE public.matches SET active = false WHERE id = $1', [unmatchId])).rowCount, 1);
    await as(outsider);
    assert.equal((await query('SELECT active FROM public.matches WHERE id = $1', [unmatchId])).rows[0].active, false);
    await denied("INSERT INTO public.messages (match_id, sender_id, content) VALUES ($1, $2, 'unmatched')", [unmatchId, outsider]);
    await denied('UPDATE public.matches SET active = true WHERE id = $1', [unmatchId]);
    pass();

    check('anonymous clients cannot read private profiles/chat or forge application data');
    await as(null, 'anon');
    assert.equal((await query('SELECT id FROM public.profiles WHERE id = $1', [alice])).rowCount, 0);
    assert.equal((await query('SELECT id FROM public.messages WHERE match_id = $1', [matchId])).rowCount, 0);
    await denied("INSERT INTO public.notifications (user_id, type, title) VALUES ($1, 'system', 'forged')", [alice]);
    await denied("INSERT INTO public.pickup_lines (text) VALUES ('forged')");
    await as(alice);
    await denied("INSERT INTO public.premium_subscriptions (user_id, plan_id) VALUES ($1, 'spark_vip')", [alice]);
    pass();
  } catch (error) {
    console.error(`FAIL ${currentTest} (${error.code || error.name})`);
    process.exitCode = 1;
  } finally {
    try { await query('ROLLBACK'); console.log('CLEANUP all fixture users and data rolled back'); }
    finally { await db.end(); }
  }
  console.log(`${passed} backend smoke groups passed`);
}

main().catch(error => { console.error(`Backend smoke could not finish (${error.code || error.name})`); process.exitCode = 1; });
