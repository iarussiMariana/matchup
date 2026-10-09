'use strict';

// Read-only public auth settings; never logs API keys or changes confirmation settings.
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const url = source.match(/\bSUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
  const key = source.match(/\bSUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
  if (!url || !key) throw new Error('Public client configuration unavailable');
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Settings request failed (${response.status})`);
  const settings = await response.json();
  let smtpInspectionAvailable = false;
  let customSmtpConfigured = null;
  let customEmailHookEnabled = null;
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    const projectRef = new URL(url).hostname.split('.')[0];
    const configuration = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    });
    if (configuration.ok) {
      const auth = await configuration.json();
      smtpInspectionAvailable = true;
      customSmtpConfigured = Boolean(auth.smtp_host);
      customEmailHookEnabled = Boolean(auth.hook_send_email_enabled);
    }
  }
  console.log(JSON.stringify({
    emailEnabled: settings.external?.email,
    signupDisabled: settings.disable_signup,
    emailAutoconfirm: settings.mailer_autoconfirm,
    phoneAutoconfirm: settings.phone_autoconfirm,
    smtpInspectionAvailable,
    customSmtpConfigured,
    customEmailHookEnabled,
  }, null, 2));
}

main().catch(error => { console.error(`Auth settings check failed (${error.name})`); process.exitCode = 1; });
