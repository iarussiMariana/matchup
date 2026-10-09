'use strict';

// No recovery email is requested. Uses one new tagged .invalid user, never browser fixtures.
// With SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY: tests actual admin-generated links.
// Without admin credentials: seeds a DB recovery token and explicitly reports that limitation.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { createClient } = require('@supabase/supabase-js');
const { client } = require('./backend-db');

async function main() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const url = source.match(/\bSUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const key = source.match(/\bSUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const handlerSource = source.match(/function setupRecovery\(\)\s*\{[\s\S]*?(?=\nfunction setupAuth\()/)?.[0];
  assert.ok(url && key && handlerSource, 'Recovery frontend contract unavailable');
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const authClient = createClient(url, key, options);
  const adminClient = adminKey ? createClient(url, adminKey, options) : null;
  const id = randomUUID();
  const email = `backend-recovery-${id}@example.invalid`;
  let password = randomBytes(24).toString('base64url');
  const tag = 'spark-mvp-recovery-fixture';
  const db = client();
  let committed = false;
  let stage = 'creating recovery fixture';
  try {
    await db.connect();
    await db.query('BEGIN');
    await db.query(`INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
        extensions.crypt($3, extensions.gen_salt('bf', 10)), now(), '', '', '', '',
        '{"provider":"email","providers":["email"]}', $4::jsonb, now(), now())`,
      [id, email, password, JSON.stringify({ name: 'Recovery test fixture', birth_date: '1995-06-15', backend_fixture: tag })]);
    await db.query(`INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
      VALUES ($1::text, $1::uuid, $2::jsonb, 'email', now(), now())`,
      [id, JSON.stringify({ sub: id, email, email_verified: true, phone_verified: false })]);
    await db.query('COMMIT');
    committed = true;

    const elements = new Map();
    const $ = selector => {
      if (!elements.has(selector)) elements.set(selector, { value: '', textContent: '', reset() {}, classList: { add() {}, remove() {} } });
      return elements.get(selector);
    };
    const context = vm.createContext({ $, URL, SUPABASE_URL: url, sparkClient: authClient,
      verifiedRecoveryLink: null, state: { userId: null, user: {} }, navigate() {},
      runAuth: async (_form, action) => action() });
    vm.runInContext(`${handlerSource}\nsetupRecovery();`, context);
    const form = $('#recoveryApplyForm');
    async function submit() { await form.onsubmit({ preventDefault() {}, currentTarget: form }); }

    stage = 'rejecting unrelated recovery URLs before authentication';
    $('#recoveryLink').value = 'https://example.invalid/auth/v1/verify?type=recovery&token=invalid';
    await assert.rejects(submit, /Copie/);
    console.log(`PASS ${stage}`);

    for (const parameter of ['token', 'token_hash']) {
      stage = `frontend ${parameter} extraction, verifyOtp, password update and login`;
      let actionLink;
      if (adminClient) {
        const { data, error } = await adminClient.auth.admin.generateLink({ type: 'recovery', email });
        if (error) throw error;
        actionLink = new URL(data.properties.action_link);
      } else {
        const otp = randomBytes(24).toString('hex');
        const tokenHash = createHash('sha224').update(email + otp).digest('hex');
        await db.query(`UPDATE auth.users SET recovery_token = $2, recovery_sent_at = now()
          WHERE id = $1 AND raw_user_meta_data->>'backend_fixture' = $3`, [id, tokenHash, tag]);
        // Current GoTrue reads auth.one_time_tokens; retain the legacy field for compatibility.
        await db.query("DELETE FROM auth.one_time_tokens WHERE user_id = $1 AND token_type = 'recovery_token'", [id]);
        await db.query(`INSERT INTO auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to, expires_at)
          VALUES ($1, $2, 'recovery_token', $3, $4, now() + interval '10 minutes')`,
          [randomUUID(), id, tokenHash, email]);
        actionLink = new URL(`${url}/auth/v1/verify`);
        actionLink.searchParams.set('type', 'recovery');
        actionLink.searchParams.set('token', tokenHash);
      }
      const tokenHash = actionLink.searchParams.get('token_hash') || actionLink.searchParams.get('token');
      assert.ok(tokenHash);
      actionLink.searchParams.delete('token');
      actionLink.searchParams.delete('token_hash');
      actionLink.searchParams.set(parameter, tokenHash);
      const newPassword = randomBytes(24).toString('base64url');
      $('#recoveryLink').value = actionLink.toString();
      $('#recoveryPassword').value = newPassword;
      await submit();
      assert.equal($('#authNotice').textContent, 'Senha atualizada. Entre com a nova senha.');
      const oldLogin = await authClient.auth.signInWithPassword({ email, password });
      assert.ok(oldLogin.error, 'Old password remained usable');
      const login = await authClient.auth.signInWithPassword({ email, password: newPassword });
      if (login.error) throw login.error;
      assert.equal(login.data.user.id, id);
      const signout = await authClient.auth.signOut({ scope: 'local' });
      if (signout.error) throw signout.error;
      const replay = await authClient.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      assert.ok(replay.error, 'Recovery token must be single-use');
      password = newPassword;
      console.log(`PASS ${stage}; old password and replay rejected`);
    }
    console.log(JSON.stringify({ adminLinkGenerationVerified: Boolean(adminClient), dbRecoveryFixtureUsed: !adminClient, recoveryEmailRequested: false }));
  } catch (error) {
    console.error(`FAIL ${stage} (${error.code || error.name})`);
    process.exitCode = 1;
  } finally {
    try {
      await authClient.auth.signOut({ scope: 'local' });
      await db.query('ROLLBACK');
      if (committed) {
        const deleted = await db.query(`DELETE FROM auth.users WHERE id = $1 AND email = $2
          AND raw_user_meta_data->>'backend_fixture' = $3`, [id, email, tag]);
        assert.equal(deleted.rowCount, 1);
        console.log('CLEANUP only the new recovery fixture removed; three browser fixtures untouched.');
      }
    } finally { await db.end(); }
  }
}

main().catch(error => { console.error(`Recovery validation failed (${error.code || error.name})`); process.exitCode = 1; });
