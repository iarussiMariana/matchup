'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, main } = require('../tools/deploy-lab.cjs');
test('laboratory migration is a self-scoped explicit-confirmation RPC', () => {
  const sql = validate();
  assert.match(sql, /mentor_ac__actor\(\)/);
  assert.match(sql, /mentor__lock\(u\)/);
  assert.match(sql, /DELETE FROM public\.mentor_requests WHERE id=ANY\(requests\) AND \(learner_id=u OR mentor_id=u\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.mentor_reset_connections\(text\) FROM PUBLIC, anon, authenticated/);
});
test('laboratory deployment rejects unsupported flags without connecting', async () => {
  await assert.rejects(() => main(['--reset']), /Invalid arguments/);
  await assert.rejects(() => main(['--apply','--apply']), /Invalid arguments/);
});
