'use strict';

// Browser-test handoff: --create writes credentials only to backend-fixture.local.json.
// After browser tests: --cleanup deletes only the generated, tagged auth fixture IDs and the file.
// Never commit or print the local JSON. These confirmed fixture users do not change auth settings.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const { client } = require('./backend-db');
const artifact = path.join(__dirname, 'backend-fixture.local.json');
const fixtureTag = 'spark-mvp-browser-fixture';

function publicConfig() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const url = source.match(/\bSUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const key = source.match(/\bSUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
  if (!url || !key) throw new Error('Public client configuration unavailable');
  return { url, key };
}

async function as(db, id) {
  await db.query('SET LOCAL ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)",
    [id, JSON.stringify({ sub: id, role: 'authenticated' })]);
}

async function deleteOwnedFixtures(db, fixture) {
  assert.equal(fixture.tag, fixtureTag);
  assert.ok(Array.isArray(fixture.users) && fixture.users.length === 3);
  for (const user of fixture.users) {
    assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(user.email, `backend-ui-${user.id}@example.invalid`);
  }
  const result = await db.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])
    AND raw_user_meta_data->>'backend_fixture' = $2
    AND email = 'backend-ui-' || id::text || '@example.invalid'`,
    [fixture.users.map(user => user.id), fixtureTag]);
  const remaining = await db.query('SELECT id FROM auth.users WHERE id = ANY($1::uuid[])', [fixture.users.map(user => user.id)]);
  assert.equal(remaining.rowCount, 0, 'Cleanup refused an untagged/nonfixture user');
  return result.rowCount;
}

async function main() {
  const mode = process.argv[2];
  assert.ok(mode === '--create' || mode === '--cleanup', 'Use --create or --cleanup');
  if (mode === '--cleanup' && !fs.existsSync(artifact)) {
    console.log('No browser fixture artifact remains.');
    return;
  }
  const db = client();
  let fixture;
  let committed = false;
  let createdArtifact = false;
  try {
    if (mode === '--create') assert.ok(!fs.existsSync(artifact), 'Clean up the existing fixture first');
    await db.connect();
    if (mode === '--cleanup') {
      fixture = JSON.parse(fs.readFileSync(artifact, 'utf8'));
      const count = await deleteOwnedFixtures(db, fixture);
      fs.unlinkSync(artifact);
      console.log(`CLEANUP removed ${count} owned browser fixtures and the credential artifact.`);
      return;
    }
    const { url, key } = publicConfig();
    fixture = {
      tag: fixtureTag,
      createdAt: new Date().toISOString(),
      supabaseUrl: url,
      users: ['Alice', 'Bob', 'Charlie'].map(name => {
        const id = randomUUID();
        return { id, name: `MVP Test ${name}`, email: `backend-ui-${id}@example.invalid`, password: randomBytes(24).toString('base64url') };
      }),
    };
    // Write before committing so a process interruption still leaves an exact cleanup manifest.
    fs.writeFileSync(artifact, JSON.stringify(fixture, null, 2), { flag: 'wx', mode: 0o600 });
    createdArtifact = true;
    await db.query('BEGIN');
    for (const user of fixture.users) {
      await db.query(`INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
          extensions.crypt($3, extensions.gen_salt('bf', 10)), now(), '', '', '', '',
          '{"provider":"email","providers":["email"]}', $4::jsonb, now(), now())`,
        [user.id, user.email, user.password, JSON.stringify({ name: user.name, birth_date: '1995-06-15', backend_fixture: fixtureTag })]);
      await db.query(`INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
        VALUES ($1::text, $1::uuid, $2::jsonb, 'email', now(), now())`,
        [user.id, JSON.stringify({ sub: user.id, email: user.email, email_verified: true, phone_verified: false })]);
    }
    for (const [index, user] of fixture.users.entries()) {
      await as(db, user.id);
      await db.query(`UPDATE public.profiles SET onboarding_complete = true, gender = $2,
        looking_for = 'Todos', bio = 'Temporary browser test profile', city = 'Sorocaba, SP',
        interests = ARRAY['Música', 'Tecnologia'], avatar = $3 WHERE id = $1`,
        [user.id, index === 0 ? 'Mulher' : 'Homem', ['🦊', '🐼', '🐻'][index]]);
    }
    const [alice, bob] = fixture.users;
    await as(db, alice.id);
    await db.query("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'like')", [alice.id, bob.id]);
    await as(db, bob.id);
    await db.query("INSERT INTO public.swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, 'super')", [bob.id, alice.id]);
    const match = (await db.query(`SELECT id FROM public.matches WHERE
      (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`, [alice.id, bob.id])).rows[0];
    assert.ok(match);
    fixture.matchId = match.id;
    await db.query("INSERT INTO public.messages (match_id, sender_id, content) VALUES ($1, $2, 'Mensagem de teste persistida')", [match.id, bob.id]);
    await db.query('COMMIT');
    committed = true;
    fs.writeFileSync(artifact, JSON.stringify(fixture, null, 2), { mode: 0o600 });

    for (const user of fixture.users) {
      const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: user.password }), signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200, 'Fixture password login failed');
      const session = await response.json();
      assert.equal(session.user.id, user.id);
      const logout = await fetch(`${url}/auth/v1/logout?scope=local`, {
        method: 'POST', headers: { apikey: key, Authorization: `Bearer ${session.access_token}` },
        signal: AbortSignal.timeout(15000),
      });
      assert.ok(logout.ok, 'Fixture verification logout failed');
    }
    console.log('PASS 3 fixture password logins; persisted mutual match and unread message available.');
    console.log('Credentials are only in tests/backend-fixture.local.json. Run --cleanup after browser tests.');
  } catch (error) {
    try {
      await db.query('ROLLBACK');
      if (createdArtifact) {
        if (committed) await deleteOwnedFixtures(db, fixture);
        fs.unlinkSync(artifact);
      }
    } catch (_) {
      console.error('Fixture cleanup incomplete; retain local artifact and rerun --cleanup.');
    }
    throw error;
  } finally { await db.end(); }
}

main().catch(error => { console.error(`Browser fixture operation failed (${error.code || error.name})`); process.exitCode = 1; });
