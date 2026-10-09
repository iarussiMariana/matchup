'use strict';
// No default account, no JWT claims, no auth.users bans. Explicit UUID required.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function parse(args) {
  if (!args.length || (args.length === 1 && args[0] === '--help')) return { action: 'help' };
  if (args.length === 2 && ['--check', '--grant', '--revoke'].includes(args[0]) && UUID.test(args[1])) return { action: args[0].slice(2), user: args[1].toLowerCase() };
  throw new Error('Usage: node tools\\moderation-admin.cjs [--check UUID | --grant UUID | --revoke UUID]');
}
async function execute(db, { action, user }) {
  if (!['check', 'grant', 'revoke'].includes(action) || !UUID.test(user || '')) throw new Error('Explicit valid target required.');
  if (action === 'check') return (await db.query('SELECT EXISTS(SELECT 1 FROM public.mentor_moderators WHERE user_id=$1::uuid) enabled', [user])).rows[0].enabled;
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL lock_timeout='10s'");
    await db.query('SELECT public.mentor__lock($1::uuid)', [user]);
    if (action === 'grant') {
      const { rows } = await db.query('SELECT public.mentor__eligible($1::uuid) eligible', [user]);
      if (!rows[0].eligible) throw new Error('Target must be an eligible existing account.');
      await db.query('INSERT INTO public.mentor_moderators(user_id) VALUES($1::uuid) ON CONFLICT DO NOTHING', [user]);
    } else await db.query('DELETE FROM public.mentor_moderators WHERE user_id=$1::uuid', [user]);
    await db.query('COMMIT');
    return action === 'grant';
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
async function main(args = process.argv.slice(2)) {
  const options = parse(args);
  if (options.action === 'help') { console.log('Moderator roles are stored only in the protected database table.\nUsage: node tools\\moderation-admin.cjs [--check UUID | --grant UUID | --revoke UUID]\nDefault/help never connects. --check is read-only. Grant/revoke require an explicit existing user UUID and administrator database access.'); return; }
  const { client } = require('../tests/backend-db'); let db;
  try { db = client(); await db.connect(); const enabled = await execute(db, options); console.log(`Moderator role ${enabled ? 'enabled' : 'disabled'} for the explicitly supplied target.`); }
  finally { if (db) await db.end(); }
}
if (require.main === module) main().catch(() => { console.error('Moderator operation failed. Verify explicit UUID, schema and administrator access; database details suppressed.'); process.exitCode = 1; });
module.exports = { parse, execute, main };
