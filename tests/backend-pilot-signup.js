'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { client } = require('./backend-db');

async function main() {
  if (process.env.SPARK_PILOT !== '1') throw new Error('Set SPARK_PILOT=1 to run this live, disposable signup test.');
  const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const url = source.match(/const SUPABASE_URL = '([^']+)'/)[1];
  const key = source.match(/const SUPABASE_ANON_KEY = '([^']+)'/)[1];
  const settingsResponse = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  assert.equal(settingsResponse.status, 200);
  const settings = await settingsResponse.json();
  assert.equal(settings.mailer_autoconfirm, true, 'Abort: signup must not send confirmation email');
  const db = client();
  await db.connect();
  const ownedEmails = [];
  try {
    for (let index = 0; index < 2; index++) {
      const email = `spark-pilot-test-${randomUUID()}@example.com`;
      const password = `${randomUUID()}Aa1!`;
      ownedEmails.push(email);
      const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { name: 'Teste descartável', birth_date: '2000-01-01' } },
      });
      assert.equal(error, null, error?.message);
      assert.ok(data.session?.access_token, 'Signup must immediately return a session');
      assert.equal(data.user.email, email);
      const profile = await supabase.from('profiles').select('id,onboarding_complete').eq('id', data.user.id).single();
      assert.equal(profile.error, null, profile.error?.message);
      assert.equal(profile.data.onboarding_complete, false);
      const signedOut = await supabase.auth.signOut({ scope: 'local' });
      assert.equal(signedOut.error, null, signedOut.error?.message);
      const loggedIn = await supabase.auth.signInWithPassword({ email, password });
      assert.equal(loggedIn.error, null, loggedIn.error?.message);
      assert.equal(loggedIn.data.user.id, data.user.id);
      await supabase.auth.signOut({ scope: 'local' });
      console.log(`PASS consecutive signup ${index + 1}: immediate session, persisted profile and password login`);
    }
  } finally {
    try {
      const removed = await db.query('DELETE FROM auth.users WHERE email = ANY($1::text[]) RETURNING id', [ownedEmails]);
      const remaining = await db.query('SELECT count(*)::integer AS count FROM auth.users WHERE email = ANY($1::text[])', [ownedEmails]);
      assert.equal(remaining.rows[0].count, 0);
      console.log(`CLEANUP removed ${removed.rowCount} disposable accounts; no test credentials written`);
    } finally {
      await db.end();
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
