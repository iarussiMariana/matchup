'use strict';

// Requires tests/backend-fixture.local.json; leaves those browser users intact.
// Creates and cleans up only its uniquely named PNG objects via authenticated Storage HTTP calls.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

async function main() {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'backend-fixture.local.json'), 'utf8'));
  const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const key = source.match(/\bSUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const url = source.match(/\bSUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
  assert.ok(key && url && url === fixture.supabaseUrl);
  const [alice, bob] = fixture.users;
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const objectName = `${alice.id}/backend-storage-${randomUUID()}.png`;
  const forbiddenName = `${bob.id}/backend-storage-${randomUUID()}.png`;
  const sessions = [];
  let stage = 'fixture login';
  let aliceSession;
  let bobSession;
  let uploaded = false;
  let unexpectedUpload = false;

  function request(route, session, options = {}) {
    return fetch(`${url}${route}`, {
      ...options,
      headers: { apikey: key, ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}), ...options.headers },
      signal: AbortSignal.timeout(20000),
    });
  }
  async function login(user) {
    const response = await request('/auth/v1/token?grant_type=password', null, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    assert.equal(response.status, 200, 'Fixture login failed');
    const session = await response.json();
    assert.equal(session.user.id, user.id);
    sessions.push(session);
    return session;
  }
  async function remove(name, session) {
    const response = await request('/storage/v1/object/photos', session, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [name] }),
    });
    assert.ok(response.ok, 'Storage delete request failed');
    const deleted = await response.json();
    assert.ok(Array.isArray(deleted));
    return deleted;
  }

  try {
    aliceSession = await login(alice);
    bobSession = await login(bob);
    stage = 'authenticated upload into own UUID folder';
    const upload = await request(`/storage/v1/object/photos/${objectName}`, aliceSession, {
      method: 'POST', headers: { 'Content-Type': 'image/png', 'x-upsert': 'false' }, body: image,
    });
    assert.ok(upload.ok, 'Own-folder upload failed');
    uploaded = true;
    console.log(`PASS ${stage}`);

    stage = 'authenticated read and intentional public read return original PNG bytes';
    for (const [route, session] of [
      [`/storage/v1/object/authenticated/photos/${objectName}`, aliceSession],
      [`/storage/v1/object/public/photos/${objectName}`, null],
    ]) {
      const response = await request(route, session);
      assert.equal(response.status, 200, 'Photo read failed');
      assert.ok(response.headers.get('content-type')?.startsWith('image/png'));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
    }
    console.log(`PASS ${stage}`);

    stage = 'another user cannot upload into someone else\'s UUID folder';
    const rejected = await request(`/storage/v1/object/photos/${forbiddenName}`, aliceSession, {
      method: 'POST', headers: { 'Content-Type': 'image/png', 'x-upsert': 'false' }, body: image,
    });
    unexpectedUpload = rejected.ok;
    assert.ok(!rejected.ok, 'Cross-user upload was unexpectedly accepted');
    const error = await rejected.json();
    assert.ok([401, 403].includes(Number(error.statusCode)) || [401, 403].includes(rejected.status), 'Expected authorization denial');
    console.log(`PASS ${stage}`);

    stage = 'another user cannot delete owner\'s photo';
    assert.equal((await remove(objectName, bobSession)).length, 0);
    const preserved = await request(`/storage/v1/object/authenticated/photos/${objectName}`, aliceSession);
    assert.equal(preserved.status, 200);
    console.log(`PASS ${stage}`);

    stage = 'owner delete removes object from authenticated listing';
    const removed = await remove(objectName, aliceSession);
    assert.equal(removed.length, 1);
    assert.equal(removed[0].name, objectName);
    uploaded = false;
    const listed = await request('/storage/v1/object/list/photos', aliceSession, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: `${alice.id}/`, search: objectName.split('/')[1], limit: 100 }),
    });
    assert.ok(listed.ok);
    assert.equal((await listed.json()).length, 0);
    console.log(`PASS ${stage}`);
  } catch (error) {
    console.error(`FAIL ${stage} (${error.code || error.name})`);
    process.exitCode = 1;
  } finally {
    let cleanupFailed = false;
    if (uploaded && aliceSession) {
      try { await remove(objectName, aliceSession); } catch (_) { cleanupFailed = true; }
    }
    if (unexpectedUpload && bobSession) {
      try { await remove(forbiddenName, bobSession); } catch (_) { cleanupFailed = true; }
    }
    for (const session of sessions) {
      try {
        const logout = await request('/auth/v1/logout?scope=local', session, { method: 'POST' });
        if (!logout.ok) cleanupFailed = true;
      } catch (_) { cleanupFailed = true; }
    }
    if (cleanupFailed) {
      console.error('Storage test cleanup needs attention; browser fixtures were not deleted.');
      process.exitCode = 1;
    } else {
      console.log('CLEANUP storage test objects and verification sessions removed; browser fixtures retained.');
    }
  }
}

main().catch(error => { console.error(`Storage validation failed (${error.code || error.name})`); process.exitCode = 1; });
